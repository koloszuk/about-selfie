import * as THREE from 'three';
import { getPublicAssetUrl } from '../runtime/embedMode.js';
import { MAX_RIPPLE_WAVES, createProjectedHeadMotion, createMovementEmitter,
  getMovementDrive, getWaveEnvelope } from './backgroundRippleMotion.js';

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
const packShader = `
  varying vec2 vUv;
  uniform sampler2D field;
  uniform sampler2D mask;
  void main() {
    gl_FragColor = vec4(texture2D(field, vUv).xyz, step(0.12, texture2D(mask, vUv).a));
  }
`;
const backgroundShader = `
  varying vec2 vUv;
  uniform sampler2D backgroundMap;
  uniform sampler2D waveFields[${MAX_RIPPLE_WAVES}];
  uniform vec4 waveData[${MAX_RIPPLE_WAVES}];
  uniform sampler2D nearFieldA;
  uniform sampler2D nearFieldB;
  uniform float nearBlend;
  uniform float nearStrength;
  uniform float nearWidth;
  uniform float waveCount;
  uniform float displacementLimit;
  uniform sampler2D grainMap;
  uniform vec2 viewerSize;
  uniform vec2 fieldSize;
  uniform vec2 coverScale;
  uniform float grainOpacity;
  // Keep jump-flood propagation point-sampled, but reconstruct its frozen
  // nearest-contour coordinates smoothly for the full-resolution display.
  vec4 smoothField(sampler2D field, vec2 uv) {
    vec2 pixel = uv * fieldSize - 0.5;
    vec2 base = (floor(pixel) + 0.5) / fieldSize;
    vec2 f = fract(pixel);
    vec2 texel = 1.0 / fieldSize;
    return mix(mix(texture2D(field, base), texture2D(field, base + vec2(texel.x, 0.0)), f.x),
      mix(texture2D(field, base + vec2(0.0, texel.y)), texture2D(field, base + texel), f.x), f.y);
  }
  vec2 waveOffset(sampler2D field, vec4 data, vec2 uv) {
    if (data.w < 0.5 || data.y < 0.001) return vec2(0.0);
    vec4 nearest = smoothField(field, uv);
    if (nearest.z < 0.5 || nearest.a > 0.5) return vec2(0.0);
    vec2 delta = (uv - nearest.xy) * viewerSize;
    float distanceToContour = length(delta);
    vec2 normal = delta / max(distanceToContour, 0.001);
    float organic = 1.0 + 0.07 * sin(nearest.x * 31.0) * sin(nearest.y * 27.0);
    float x = (distanceToContour - data.x) / max(data.z * organic, 1.0);
    float contourFade = smoothstep(0.0, max(data.z * 0.15, 1.0), distanceToContour);
    return normal * (-x * exp(-0.5 * x * x)) * data.y * contourFade;
  }
  vec2 nearOffset(sampler2D field, vec2 uv) {
    if (nearStrength < 0.001) return vec2(0.0);
    vec4 nearest = smoothField(field, uv);
    if (nearest.z < 0.5 || nearest.a > 0.5) return vec2(0.0);
    vec2 delta = (uv - nearest.xy) * viewerSize;
    float distanceToContour = length(delta);
    vec2 normal = delta / max(distanceToContour, 0.001);
    float x = distanceToContour / max(nearWidth, 1.0);
    float organic = 0.8 + 0.2 * sin(nearest.x * 31.0) * sin(nearest.y * 27.0);
    // Zero displacement exactly at the mask boundary prevents a hard seam
    // when the moving head exposes part of a previous live-field silhouette.
    float contourFade = smoothstep(0.0, max(nearWidth * 0.18, 1.0), distanceToContour);
    return normal * exp(-0.5 * x * x) * nearStrength * organic * contourFade;
  }
  vec3 softLight(vec3 base, vec3 noise) {
    vec3 d = mix(((16.0 * base - 12.0) * base + 4.0) * base,
      sqrt(max(base, vec3(0.0))), step(vec3(0.25), base));
    return mix(base - (1.0 - 2.0 * noise) * base * (1.0 - base),
      base + (2.0 * noise - 1.0) * (d - base), step(vec3(0.5), noise));
  }
  void main() {
    vec2 waves = vec2(0.0);
    ${Array.from({ length: MAX_RIPPLE_WAVES }, (_, i) =>
    `waves += waveOffset(waveFields[${i}], waveData[${i}], vUv);`).join('\n    ')}
    waves /= max(1.0, sqrt(waveCount * 0.6));
    vec2 local = mix(nearOffset(nearFieldA, vUv), nearOffset(nearFieldB, vUv), nearBlend);
    vec2 offset = waves + local;
    // Soft saturation bounds overlapping disturbances without hard clipping.
    offset /= sqrt(1.0 + dot(offset, offset) / max(displacementLimit * displacementLimit, 1.0));
    vec2 edge = min(vUv, 1.0 - vUv) * viewerSize;
    float edgeFade = smoothstep(0.0, 24.0, min(edge.x, edge.y));
    vec2 displaced = vUv + offset * edgeFade / viewerSize;
    vec2 uv = clamp((displaced - 0.5) * coverScale + 0.5, 0.0, 1.0);
    vec3 color = texture2D(backgroundMap, uv).rgb;
    vec3 noise = texture2D(grainMap, vUv).rgb;
    color = mix(color, softLight(color, noise), grainOpacity);
    // Display-referred video/still RGB: intentionally no scene lighting,
    // exposure, tone mapping, color tint, or extra alpha contribution.
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** One shared live silhouette field plus a bounded pool of frozen wave fields.
 * GPU jump flooding, no readback, no additional canvas or animation loop. */
export function createBackgroundRipple({ renderer, scene, camera, container,
  videoBackground, backgroundGrain, grainConfig, postProcessing, defaults, placeholderAsset }) {
  const settings = { ...defaults };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const headMeshes = new Set();
  const hiddenObjects = [];
  const savedColor = new THREE.Color();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  let model = null, motion = null, maskTarget = null, targets = null, nearTargets = null;
  let nearIndex = 0, nearReady = false, nearAge = 0, captureElapsed = Infinity;
  let pending = false, smoothedSpeed = 0, rawSpeed = 0, drive = 0, nearGain = 0;
  let activeCount = 0;
  const emitter = createMovementEmitter();
  const waves = Array.from({ length: MAX_RIPPLE_WAVES }, () => ({
    active: false, age: 0, gain: 0, target: null,
  }));
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
    backgroundMap: { value: placeholderTexture },
    waveFields: { value: Array(MAX_RIPPLE_WAVES).fill(neutral) },
    waveData: { value: Array.from({ length: MAX_RIPPLE_WAVES }, () => new THREE.Vector4()) },
    nearFieldA: { value: neutral }, nearFieldB: { value: neutral }, nearBlend: { value: 1 },
    nearStrength: { value: 0 }, nearWidth: { value: settings.nearHeadWidthPx },
    waveCount: { value: 0 }, displacementLimit: { value: 40 },
    grainMap: { value: grainTexture }, viewerSize: { value: new THREE.Vector2(1, 1) },
    fieldSize: { value: new THREE.Vector2(1, 1) },
    coverScale: { value: new THREE.Vector2(1, 1) },
    grainOpacity: { value: grainConfig.enabled && backgroundGrain.canvas ? grainConfig.opacity : 0 },
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
  const packMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: packShader,
    uniforms: { field: { value: null }, mask: { value: null } },
    depthTest: false, depthWrite: false, toneMapped: false });
  const passScene = new THREE.Scene();
  const passCamera = new THREE.Camera();
  const passQuad = new THREE.Mesh(geometry, seedMaterial);
  passQuad.frustumCulled = false;
  passScene.add(passQuad);

  function releaseTargets() {
    maskTarget?.dispose();
    targets?.forEach(target => target.dispose());
    nearTargets?.forEach(target => target.dispose());
    for (const wave of waves) { wave.target?.dispose(); wave.target = null; }
    maskTarget = null; targets = null; nearTargets = null;
    uniforms.waveFields.value.fill(neutral);
    uniforms.nearFieldA.value = neutral; uniforms.nearFieldB.value = neutral;
  }
  function resize(width, height) {
    uniforms.viewerSize.value.set(width, height);
    resetMovement();
    releaseTargets();
    if (!available) return;
    const scale = defaults.maskResolution / Math.max(width, height);
    const w = Math.max(16, Math.round(width * scale));
    const h = Math.max(16, Math.round(height * scale));
    uniforms.fieldSize.value.set(w, h);
    maskTarget = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    const makeField = () => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    targets = [makeField(), makeField()];
    nearTargets = [makeField(), makeField()];
    for (let i = 0; i < waves.length; i += 1) {
      waves[i].target = makeField();
      uniforms.waveFields.value[i] = waves[i].target.texture;
    }
    seedMaterial.uniforms.mask.value = maskTarget.texture;
    seedMaterial.uniforms.texel.value.set(1 / w, 1 / h);
    jumpMaterial.uniforms.resolution.value.set(w, h);
    packMaterial.uniforms.mask.value = maskTarget.texture;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(targets[0]);
    const gl = renderer.getContext();
    available = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(previous);
    if (!available) { reason = 'GPU fallback: distance-field target unsupported'; releaseTargets(); }
  }

  function capture(waveSlot = null, gain = 0) {
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
      passQuad.material = packMaterial;
      packMaterial.uniforms.field.value = targets[source].texture;
      if (!nearReady || captureElapsed >= 1 / defaults.silhouetteUpdateHz) {
        nearIndex = 1 - nearIndex;
        renderer.setRenderTarget(nearTargets[nearIndex]);
        renderer.render(passScene, passCamera);
        uniforms.nearFieldA.value = nearReady ? nearTargets[1 - nearIndex].texture : nearTargets[nearIndex].texture;
        uniforms.nearFieldB.value = nearTargets[nearIndex].texture;
        nearReady = true; nearAge = 0; captureElapsed = 0;
      }
      if (waveSlot) {
        renderer.setRenderTarget(waveSlot.target);
        renderer.render(passScene, passCamera);
        waveSlot.age = 0; waveSlot.gain = gain; waveSlot.active = true;
      }
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

  function resetMovement() {
    motion?.reset(); emitter.reset();
    pending = false; smoothedSpeed = 0; rawSpeed = 0; drive = 0; nearGain = 0;
    nearReady = false; nearAge = 0; captureElapsed = Infinity; activeCount = 0;
    for (let i = 0; i < waves.length; i += 1) {
      waves[i].active = false; uniforms.waveData.value[i].set(0, 0, 0, 0);
    }
    uniforms.nearStrength.value = 0;
  }
  document.addEventListener('visibilitychange', resetMovement);
  reducedMotion.addEventListener('change', resetMovement);
  function update(delta) {
    const canRender = available && settings.enabled && !reducedMotion.matches && !postProcessing.enabled;
    const videoReady = videoBackground.ready;
    background.visible = canRender && (videoReady || placeholderReady);
    if (!background.visible || document.hidden) { resetMovement(); return; }
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
    rawSpeed = motion?.sample(dt, viewAspect) ?? 0;
    smoothedSpeed = THREE.MathUtils.damp(smoothedSpeed, rawSpeed,
      1 / Math.max(settings.movementSmoothing, 0.001), dt);
    drive = getMovementDrive(smoothedSpeed, settings);
    nearGain = THREE.MathUtils.damp(nearGain, drive,
      drive > nearGain ? 12 : settings.nearHeadFadeSpeed, dt);
    captureElapsed += dt; nearAge += dt;
    activeCount = 0;
    let freeSlot = null;
    for (const wave of waves) {
      if (wave.active) {
        wave.age += dt;
        if (wave.age >= settings.durationSeconds) wave.active = false;
        else activeCount += 1;
      }
      if (!wave.active && !freeSlot) freeSlot = wave;
    }
    const limit = THREE.MathUtils.clamp(Math.round(settings.maxWaves), 1, MAX_RIPPLE_WAVES);
    const hasFreeSlot = Boolean(freeSlot && activeCount < limit);
    const emit = emitter.update(dt, rawSpeed, smoothedSpeed, drive, settings, hasFreeSlot);
    const manual = pending; pending = false;
    const wantsWave = hasFreeSlot && (manual || emit);
    const captureInterval = 1 / defaults.silhouetteUpdateHz;
    // Every new wave gets the exact current silhouette, not the previous live
    // field. Between emissions the live near-field is capped at 15 Hz.
    const wantsNearCapture = nearGain > 0.002 && rawSpeed > 0.1 && captureElapsed >= captureInterval;
    // Full pools skip, never replace a visible wave or queue missed waves.
    if (wantsWave || wantsNearCapture) capture(wantsWave ? freeSlot : null, manual ? 1 : drive);
    const scale = uniforms.viewerSize.value.y / settings.referenceHeight;
    activeCount = 0;
    let blendWeight = 0;
    for (let i = 0; i < waves.length; i += 1) {
      const wave = waves[i];
      const data = uniforms.waveData.value[i];
      if (!wave.active) { data.w = 0; continue; }
      activeCount += 1;
      const t = THREE.MathUtils.clamp(wave.age / settings.durationSeconds, 0, 1);
      const front = THREE.MathUtils.lerp(-settings.startInsetPx, settings.expansionPx,
        1 - (1 - t) ** settings.easing) * scale;
      const emergence = settings.startInsetPx > 0
        ? THREE.MathUtils.smoothstep(front, 0, Math.max(settings.softnessPx * scale, 1)) : 1;
      const envelope = wave.gain * getWaveEnvelope(wave.age, settings) * emergence;
      blendWeight += envelope;
      data.set(front, settings.strengthPx * scale * envelope,
        settings.softnessPx * scale, 1);
    }
    // Normalize using continuous envelope weights, not an integer wave count:
    // births/deaths therefore cannot abruptly attenuate the existing waves.
    uniforms.waveCount.value = blendWeight;
    uniforms.nearBlend.value = THREE.MathUtils.smoothstep(nearAge, 0, captureInterval);
    uniforms.nearStrength.value = nearReady ? nearGain * settings.nearHeadStrengthPx * scale : 0;
    uniforms.nearWidth.value = settings.nearHeadWidthPx * scale;
    uniforms.displacementLimit.value = Math.max(1, settings.nearHeadStrengthPx + settings.strengthPx * 1.5) * scale;
    if (!available) background.visible = false;
  }
  return {
    settings, update, resize,
    setModel(root) {
      model = root; headMeshes.clear();
      root.traverse(object => { if (object.isMesh) headMeshes.add(object); });
      const rigidHead = root.getObjectByName('head_LowPoly') ?? root.getObjectByName('HEAD_ANIMATION_ROOT') ?? root;
      motion = createProjectedHeadMotion(rigidHead, camera, settings.referenceHeight);
      resetMovement();
    },
    trigger() { if (settings.enabled) pending = true; },
    get supported() { return available && !reducedMotion.matches && !postProcessing.enabled; },
    get status() {
      if (!settings.enabled) return 'Disabled — normal HTML background';
      if (reducedMotion.matches) return 'Reduced motion — static background';
      if (postProcessing.enabled) return 'FXAA mode — normal background fallback';
      return `${reason} · speed ${smoothedSpeed.toFixed(1)} reference px/s (raw ${rawSpeed.toFixed(1)})` +
        ` · drive ${(drive * 100).toFixed(1)}% · ${activeCount}/${Math.round(settings.maxWaves)} waves · captures ${captureCount}` +
        ` · mask ${maskTarget?.width ?? 0}×${maskTarget?.height ?? 0} · last capture CPU ${lastCaptureMs.toFixed(1)}ms`;
    },
    dispose() {
      document.removeEventListener('visibilitychange', resetMovement);
      reducedMotion.removeEventListener('change', resetMovement);
      scene.remove(background); releaseTargets(); geometry.dispose(); material.dispose();
      seedMaterial.dispose(); jumpMaterial.dispose(); packMaterial.dispose(); videoTexture.dispose(); placeholderTexture.dispose();
      if (grainTexture !== neutral) grainTexture.dispose();
      neutral.dispose();
    },
  };
}
