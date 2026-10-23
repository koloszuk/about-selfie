import * as THREE from 'three';
import { getPublicAssetUrl } from '../runtime/embedMode.js';

const vertexShader = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const seedShader = `
  varying vec2 vUv;
  uniform sampler2D mask;
  uniform vec2 texel;
  float inside(vec2 uv) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return step(0.12, texture2D(mask, uv).a);
  }
  void main() {
    float c = inside(vUv);
    float edge = abs(c - inside(vUv + vec2(texel.x, 0.0)))
      + abs(c - inside(vUv - vec2(texel.x, 0.0)))
      + abs(c - inside(vUv + vec2(0.0, texel.y)))
      + abs(c - inside(vUv - vec2(0.0, texel.y)));
    gl_FragColor = edge > 0.0 ? vec4(vUv, 1.0, 1.0) : vec4(-1.0, -1.0, 0.0, 1.0);
  }
`;
const jumpShader = `
  varying vec2 vUv;
  uniform sampler2D field;
  uniform vec2 resolution;
  uniform float jump;
  void main() {
    vec4 best = vec4(-1.0, -1.0, 0.0, 1.0);
    float distanceSquared = 1.0e20;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 uv = vUv + vec2(float(x), float(y)) * jump / resolution;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
        vec4 candidate = texture2D(field, uv);
        vec2 delta = (candidate.xy - vUv) * resolution;
        float d = dot(delta, delta);
        if (candidate.z > 0.5 && d < distanceSquared) {
          best = candidate; distanceSquared = d;
        }
      }
    }
    gl_FragColor = best;
  }
`;
const backgroundShader = `
  varying vec2 vUv;
  uniform sampler2D backgroundMap;
  uniform sampler2D field;
  uniform sampler2D mask;
  uniform sampler2D grainMap;
  uniform vec2 viewerSize;
  uniform vec2 fieldSize;
  uniform vec2 coverScale;
  uniform float front;
  uniform float softness;
  uniform float strength;
  uniform float grainOpacity;
  uniform float rippleActive;
  // Keep jump-flood propagation point-sampled, but reconstruct its frozen
  // nearest-contour coordinates smoothly for the full-resolution display.
  vec4 smoothField(vec2 uv) {
    vec2 pixel = uv * fieldSize - 0.5;
    vec2 base = (floor(pixel) + 0.5) / fieldSize;
    vec2 f = fract(pixel);
    vec2 texel = 1.0 / fieldSize;
    return mix(mix(texture2D(field, base), texture2D(field, base + vec2(texel.x, 0.0)), f.x),
      mix(texture2D(field, base + vec2(0.0, texel.y)), texture2D(field, base + texel), f.x), f.y);
  }
  vec3 softLight(vec3 base, vec3 noise) {
    vec3 d = mix(((16.0 * base - 12.0) * base + 4.0) * base,
      sqrt(max(base, vec3(0.0))), step(vec3(0.25), base));
    return mix(base - (1.0 - 2.0 * noise) * base * (1.0 - base),
      base + (2.0 * noise - 1.0) * (d - base), step(vec3(0.5), noise));
  }
  void main() {
    vec2 displaced = vUv;
    vec4 nearest = smoothField(vUv);
    if (rippleActive > 0.5 && nearest.z > 0.5 && texture2D(mask, vUv).a < 0.12) {
      vec2 delta = (vUv - nearest.xy) * viewerSize;
      float distanceToContour = length(delta);
      vec2 normal = delta / max(distanceToContour, 0.001);
      float organic = 1.0 + 0.07 * sin(nearest.x * 31.0) * sin(nearest.y * 27.0);
      float x = (distanceToContour - front) / max(softness * organic, 1.0);
      float wave = -x * exp(-0.5 * x * x);
      vec2 edge = min(vUv, 1.0 - vUv) * viewerSize;
      float edgeFade = smoothstep(0.0, 24.0, min(edge.x, edge.y));
      displaced += normal * wave * strength * edgeFade / viewerSize;
    }
    vec2 uv = clamp((displaced - 0.5) * coverScale + 0.5, 0.0, 1.0);
    vec3 color = texture2D(backgroundMap, uv).rgb;
    vec3 noise = texture2D(grainMap, vUv).rgb;
    color = mix(color, softLight(color, noise), grainOpacity);
    // Display-referred video/still RGB: intentionally no scene lighting,
    // exposure, tone mapping, color tint, or extra alpha contribution.
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Frozen rendered-alpha silhouette + GPU jump flooding. No CPU pixel readback,
 * no new canvas/context, and no modifications to imported head materials. */
export function createBackgroundRipple({ renderer, scene, camera, container,
  videoBackground, backgroundGrain, grainConfig, postProcessing, defaults, placeholderAsset }) {
  const settings = { ...defaults };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const headMeshes = new Set();
  const hiddenObjects = [];
  const savedColor = new THREE.Color();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  let model = null, maskTarget = null, targets = null;
  let age = 0, elapsed = 0, active = false, pending = false;
  let captureCount = 0, grainRevision = -1, placeholderReady = false, lastCaptureMs = 0;
  let available = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  let reason = available ? 'GPU ready' : 'GPU fallback: half-float rendering unavailable';
  const geometry = new THREE.PlaneGeometry(2, 2);
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  neutral.needsUpdate = true;
  const videoTexture = new THREE.VideoTexture(videoBackground.video);
  videoTexture.colorSpace = THREE.NoColorSpace;
  videoTexture.generateMipmaps = false;
  const placeholderTexture = new THREE.TextureLoader().load(getPublicAssetUrl(placeholderAsset),
    () => { placeholderReady = true; });
  placeholderTexture.colorSpace = THREE.NoColorSpace;
  placeholderTexture.generateMipmaps = false;
  placeholderTexture.minFilter = THREE.LinearFilter;
  const grainTexture = backgroundGrain.canvas ? new THREE.CanvasTexture(backgroundGrain.canvas) : neutral;
  grainTexture.colorSpace = THREE.NoColorSpace;
  grainTexture.generateMipmaps = false;
  grainTexture.minFilter = THREE.LinearFilter;
  const uniforms = {
    backgroundMap: { value: placeholderTexture }, field: { value: neutral }, mask: { value: neutral },
    grainMap: { value: grainTexture }, viewerSize: { value: new THREE.Vector2(1, 1) },
    fieldSize: { value: new THREE.Vector2(1, 1) },
    coverScale: { value: new THREE.Vector2(1, 1) }, front: { value: 0 },
    softness: { value: settings.softnessPx }, strength: { value: 0 },
    grainOpacity: { value: grainConfig.enabled && backgroundGrain.canvas ? grainConfig.opacity : 0 },
    rippleActive: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader: backgroundShader,
    uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const background = new THREE.Mesh(geometry, material);
  background.name = 'BackgroundRippleDisplay';
  background.frustumCulled = false;
  background.renderOrder = -10000;
  background.visible = false;
  scene.add(background);
  const seedMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: seedShader,
    uniforms: { mask: { value: null }, texel: { value: new THREE.Vector2() } },
    depthTest: false, depthWrite: false, toneMapped: false });
  const jumpMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: jumpShader,
    uniforms: { field: { value: null }, resolution: { value: new THREE.Vector2() }, jump: { value: 1 } },
    depthTest: false, depthWrite: false, toneMapped: false });
  const passScene = new THREE.Scene();
  const passCamera = new THREE.Camera();
  const passQuad = new THREE.Mesh(geometry, seedMaterial);
  passQuad.frustumCulled = false;
  passScene.add(passQuad);

  function releaseTargets() {
    maskTarget?.dispose();
    targets?.forEach(target => target.dispose());
    maskTarget = null; targets = null;
  }
  function resize(width, height) {
    uniforms.viewerSize.value.set(width, height);
    active = false; elapsed = 0; pending = false;
    releaseTargets();
    if (!available) return;
    const scale = defaults.maskResolution / Math.max(width, height);
    const w = Math.max(16, Math.round(width * scale));
    const h = Math.max(16, Math.round(height * scale));
    uniforms.fieldSize.value.set(w, h);
    maskTarget = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    targets = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    }));
    seedMaterial.uniforms.mask.value = maskTarget.texture;
    seedMaterial.uniforms.texel.value.set(1 / w, 1 / h);
    jumpMaterial.uniforms.resolution.value.set(w, h);
    uniforms.mask.value = maskTarget.texture;
    uniforms.field.value = targets[0].texture;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(targets[0]);
    const gl = renderer.getContext();
    available = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(previous);
    if (!available) { reason = 'GPU fallback: distance-field target unsupported'; releaseTargets(); }
  }

  function capture() {
    if (!model || !available || !maskTarget) return false;
    const started = performance.now();
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    const previousBackground = scene.background;
    renderer.getClearColor(savedColor);
    renderer.getViewport(savedViewport);
    renderer.getScissor(savedScissor);
    const previousScissorTest = renderer.getScissorTest();
    hiddenObjects.length = 0;
    // Imported meshes were registered before control sprites/debug helpers.
    scene.traverse(object => {
      if (object.visible && (object.isMesh || object.isSprite || object.isLine || object.isPoints) &&
        !headMeshes.has(object)) { hiddenObjects.push(object); object.visible = false; }
    });
    try {
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      scene.background = null;
      renderer.setRenderTarget(maskTarget);
      renderer.render(scene, camera);
      passQuad.material = seedMaterial;
      renderer.setRenderTarget(targets[0]);
      renderer.render(passScene, passCamera);
      let source = 0;
      passQuad.material = jumpMaterial;
      for (let jump = 2 ** (Math.ceil(Math.log2(Math.max(maskTarget.width, maskTarget.height))) - 1);
        jump >= 1; jump /= 2) {
        jumpMaterial.uniforms.field.value = targets[source].texture;
        jumpMaterial.uniforms.jump.value = jump;
        renderer.setRenderTarget(targets[1 - source]);
        renderer.render(passScene, passCamera);
        source = 1 - source;
      }
      uniforms.field.value = targets[source].texture;
      captureCount += 1;
      return true;
    } catch (error) {
      available = false;
      reason = 'GPU fallback: capture failed';
      console.warn('[background-ripple] Normal background retained.', error);
      return false;
    } finally {
      for (const object of hiddenObjects) object.visible = true;
      scene.background = previousBackground;
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(savedColor, previousAlpha);
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(savedViewport);
      renderer.setScissor(savedScissor);
      renderer.setScissorTest(previousScissorTest);
      lastCaptureMs = performance.now() - started;
    }
  }

  function resetSchedule() { elapsed = 0; active = false; pending = false; }
  document.addEventListener('visibilitychange', resetSchedule);
  reducedMotion.addEventListener('change', resetSchedule);
  function update(delta) {
    const canRender = available && settings.enabled && !reducedMotion.matches && !postProcessing.enabled;
    const videoReady = videoBackground.ready;
    background.visible = canRender && (videoReady || placeholderReady);
    if (!background.visible || document.hidden) { active = false; elapsed = 0; return; }
    reason = 'GPU ready';
    uniforms.backgroundMap.value = videoReady ? videoTexture : placeholderTexture;
    const image = videoReady ? videoBackground.video : placeholderTexture.image;
    const aspect = (image.videoWidth || image.width) / (image.videoHeight || image.height);
    const viewAspect = uniforms.viewerSize.value.x / uniforms.viewerSize.value.y;
    uniforms.coverScale.value.set(Math.min(1, viewAspect / aspect), Math.min(1, aspect / viewAspect));
    if (backgroundGrain.revision !== grainRevision && grainTexture !== neutral) {
      grainRevision = backgroundGrain.revision;
      grainTexture.needsUpdate = true;
    }
    const dt = Math.min(Math.max(delta, 0), 0.1);
    elapsed += dt;
    if (active) age += dt;
    if (pending || elapsed >= settings.intervalSeconds) {
      pending = false; elapsed = 0;
      active = capture(); age = 0;
    }
    const t = Math.min(age / settings.durationSeconds, 1);
    if (t >= 1) active = false;
    const scale = uniforms.viewerSize.value.y / settings.referenceHeight;
    uniforms.front.value = settings.expansionPx * scale * (1 - (1 - t) ** settings.easing);
    uniforms.strength.value = settings.strengthPx * scale * (1 - t) ** 2;
    uniforms.softness.value = settings.softnessPx * scale;
    uniforms.rippleActive.value = active ? 1 : 0;
    if (!available) background.visible = false;
  }
  return {
    settings, update, resize,
    setModel(root) {
      model = root; headMeshes.clear();
      root.traverse(object => { if (object.isMesh) headMeshes.add(object); });
      resetSchedule();
    },
    trigger() { if (settings.enabled) pending = true; },
    get supported() { return available; },
    get status() {
      if (!settings.enabled) return 'Disabled — normal HTML background';
      if (reducedMotion.matches) return 'Reduced motion — static background';
      if (postProcessing.enabled) return 'FXAA mode — normal background fallback';
      return `${reason} · ${active ? `playing ${age.toFixed(1)}s` : 'waiting'} · captures ${captureCount}` +
        ` · mask ${maskTarget?.width ?? 0}×${maskTarget?.height ?? 0} · last capture CPU ${lastCaptureMs.toFixed(1)}ms`;
    },
    dispose() {
      document.removeEventListener('visibilitychange', resetSchedule);
      reducedMotion.removeEventListener('change', resetSchedule);
      scene.remove(background); releaseTargets(); geometry.dispose(); material.dispose();
      seedMaterial.dispose(); jumpMaterial.dispose(); videoTexture.dispose(); placeholderTexture.dispose();
      if (grainTexture !== neutral) grainTexture.dispose();
      neutral.dispose();
    },
  };
}
