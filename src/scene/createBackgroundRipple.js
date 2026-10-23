import * as THREE from 'three';
import { getPublicAssetUrl } from '../runtime/embedMode.js';
import { createProjectedHeadMotion, createWavefieldStepper, getMovementDrive,
  getWaveStepSeconds } from './backgroundRippleMotion.js';

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
  void main() { gl_FragColor = vec4(texture2D(field, vUv).xyz, step(0.12, texture2D(mask, vUv).a)); }
`;
// Shared source band: the near-head gain and the simulation use exactly the
// same smoothly interpolated contour, rather than joining two separate effects.
const sourceShader = `
  uniform sampler2D sourceA;
  uniform sampler2D sourceB;
  uniform vec2 fieldSize;
  uniform vec2 referenceSize;
  uniform float sourceBlend;
  uniform float sourceReady;
  uniform float sourceWidth;
  vec4 smoothContour(sampler2D field, vec2 uv) {
    vec2 p = uv * fieldSize - 0.5;
    vec2 base = (floor(p) + 0.5) / fieldSize;
    vec2 f = fract(p), texel = 1.0 / fieldSize;
    return mix(mix(texture2D(field, base), texture2D(field, base + vec2(texel.x, 0.0)), f.x),
      mix(texture2D(field, base + vec2(0.0, texel.y)), texture2D(field, base + texel), f.x), f.y);
  }
  float contourBand(sampler2D field, vec2 uv) {
    vec4 nearest = smoothContour(field, uv);
    if (nearest.z < 0.5 || nearest.a > 0.5) return 0.0;
    float d = length((uv - nearest.xy) * referenceSize);
    float x = d / sourceWidth;
    return exp(-0.5 * x * x) * smoothstep(0.0, sourceWidth * 0.25, d);
  }
  float currentSource(vec2 uv) {
    if (sourceReady < 0.5) return 0.0;
    return mix(contourBand(sourceA, uv), contourBand(sourceB, uv), sourceBlend);
  }
`;
const simulationShader = `
  varying vec2 vUv;
  uniform sampler2D state;
  uniform vec2 texel;
  uniform vec2 cellSize;
  uniform float dt;
  uniform float speed;
  uniform float dissipation;
  uniform float emission;
  uniform float phase;
  uniform float density;
  ${sourceShader}
  float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
      mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
      mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec2 hv = texture2D(state, vUv).rg;
    float left = texture2D(state, vUv - vec2(texel.x, 0.0)).r;
    float right = texture2D(state, vUv + vec2(texel.x, 0.0)).r;
    float down = texture2D(state, vUv - vec2(0.0, texel.y)).r;
    float up = texture2D(state, vUv + vec2(0.0, texel.y)).r;
    float laplacian = (left + right - 2.0 * hv.x) / (cellSize.x * cellSize.x)
      + (down + up - 2.0 * hv.x) / (cellSize.y * cellSize.y);
    float force = 0.0;
    if (emission > 0.0001) {
      float band = currentSource(vUv);
      if (band > 0.0001) {
        vec3 p = vec3(vUv * vec2(referenceSize.x / referenceSize.y, 1.0) * density, phase);
        // Non-periodic, spatially varying pressure: never a whole-silhouette
        // sine pulse, event envelope, or synchronized expanding outline.
        float pressure = 2.8 * (2.0 * (noise3(p) + 0.35 * noise3(p * 1.93 + vec3(4.2,9.4,1.7))) / 1.35 - 1.0);
        force = (pressure - hv.x) * 90.0 * band * emission;
      }
    }
    float border = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
    float sponge = (1.0 - smoothstep(0.0, 0.10, border)) * 12.0;
    float velocity = (hv.y + (speed * speed * laplacian + force) * dt)
      * exp(-(dissipation + sponge) * dt);
    float height = (hv.x + velocity * dt) * exp(-(dissipation * 0.15 + sponge * 0.4) * dt);
    gl_FragColor = vec4(clamp(height, -8.0, 8.0), clamp(velocity, -120.0, 120.0), 0.0, 1.0);
  }
`;
const backgroundShader = `
  varying vec2 vUv;
  uniform sampler2D backgroundMap;
  uniform sampler2D heightField;
  uniform sampler2D grainMap;
  uniform vec2 viewerSize;
  uniform vec2 coverScale;
  uniform vec2 texel;
  uniform vec2 cellSize;
  uniform float strength;
  uniform float nearStrength;
  uniform float emission;
  uniform float displacementLimit;
  uniform float grainOpacity;
  ${sourceShader}
  vec3 softLight(vec3 base, vec3 noise) {
    vec3 d = mix(((16.0 * base - 12.0) * base + 4.0) * base,
      sqrt(max(base, vec3(0.0))), step(vec3(0.25), base));
    return mix(base - (1.0 - 2.0 * noise) * base * (1.0 - base),
      base + (2.0 * noise - 1.0) * (d - base), step(vec3(0.5), noise));
  }
  void main() {
    float left = texture2D(heightField, vUv - vec2(texel.x, 0.0)).r;
    float right = texture2D(heightField, vUv + vec2(texel.x, 0.0)).r;
    float down = texture2D(heightField, vUv - vec2(0.0, texel.y)).r;
    float up = texture2D(heightField, vUv + vec2(0.0, texel.y)).r;
    // Deliberately high refraction gain for this visual iteration; the live
    // strength controls can reduce it without weakening the simulation itself.
    vec2 gradient = vec2(right - left, up - down) * 4.5 / cellSize;
    float localGain = emission > 0.0001 ? nearStrength * emission * currentSource(vUv) : 0.0;
    vec2 offset = gradient * (strength + localGain);
    offset /= sqrt(1.0 + dot(offset, offset) / max(displacementLimit * displacementLimit, 1.0));
    vec2 edge = min(vUv, 1.0 - vUv) * viewerSize;
    float edgeFade = smoothstep(0.0, 24.0, min(edge.x, edge.y));
    vec2 uv = clamp((vUv + offset * edgeFade / viewerSize - 0.5) * coverScale + 0.5, 0.0, 1.0);
    vec3 color = texture2D(backgroundMap, uv).rgb;
    color = mix(color, softLight(color, texture2D(grainMap, vUv).rgb), grainOpacity);
    // Original video RGB only. No field visualization, tone mapping, tint or glow.
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Reuses the head-alpha/JFA capture and the existing renderer. The temporal
 * state is one persistent height/velocity field, never a pool of ripple events. */
export function createBackgroundRipple({ renderer, scene, camera,
  videoBackground, backgroundGrain, grainConfig, postProcessing, defaults, placeholderAsset }) {
  const settings = { ...defaults };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const headMeshes = new Set(), hiddenObjects = [];
  const stepper = createWavefieldStepper(defaults.maxSimulationSteps);
  const savedColor = new THREE.Color(), savedViewport = new THREE.Vector4(), savedScissor = new THREE.Vector4();
  const saved = { target: null, background: null, autoClear: true, alpha: 0, scissorTest: false };
  let model = null, motion = null, maskTarget = null, scratch = null, sourceTargets = null, waveTargets = null;
  let sourceIndex = 0, waveIndex = 0, sourceAge = 0, captureElapsed = Infinity;
  let smoothedSpeed = 0, rawSpeed = 0, drive = 0, phase = 0, tailRemaining = 0;
  let sourceReady = false, hasField = false, needsClear = true, suspended = true;
  let stepsThisFrame = 0, captureCount = 0, grainRevision = -1, placeholderReady = false, lastCaptureMs = 0;
  let available = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  let reason = available ? 'GPU continuous field' : 'GPU fallback: half-float rendering unavailable';
  const geometry = new THREE.PlaneGeometry(2, 2);
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  const neutralGrain = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  black.needsUpdate = true; neutralGrain.needsUpdate = true;
  const videoTexture = new THREE.VideoTexture(videoBackground.video);
  videoTexture.colorSpace = THREE.NoColorSpace; videoTexture.generateMipmaps = false;
  const placeholderTexture = new THREE.TextureLoader().load(getPublicAssetUrl(placeholderAsset),
    () => { placeholderReady = true; });
  placeholderTexture.colorSpace = THREE.NoColorSpace;
  placeholderTexture.generateMipmaps = false; placeholderTexture.minFilter = THREE.LinearFilter;
  const grainTexture = backgroundGrain.canvas ? new THREE.CanvasTexture(backgroundGrain.canvas) : neutralGrain;
  grainTexture.colorSpace = THREE.NoColorSpace;
  grainTexture.generateMipmaps = false; grainTexture.minFilter = THREE.LinearFilter;
  const sourceUniforms = {
    sourceA: { value: black }, sourceB: { value: black }, sourceBlend: { value: 1 }, sourceReady: { value: 0 },
    fieldSize: { value: new THREE.Vector2(1, 1) }, referenceSize: { value: new THREE.Vector2(772, 475) },
    sourceWidth: { value: defaults.sourceWidthPx },
  };
  const uniforms = {
    ...sourceUniforms, backgroundMap: { value: placeholderTexture }, heightField: { value: black },
    grainMap: { value: grainTexture }, viewerSize: { value: new THREE.Vector2(1, 1) },
    coverScale: { value: new THREE.Vector2(1, 1) }, texel: { value: new THREE.Vector2(1, 1) },
    cellSize: { value: new THREE.Vector2(3, 3) }, strength: { value: 0 }, nearStrength: { value: 0 },
    emission: { value: 0 }, displacementLimit: { value: 100 },
    grainOpacity: { value: grainConfig.enabled && backgroundGrain.canvas ? grainConfig.opacity : 0 },
  };
  const simulationUniforms = { ...sourceUniforms, state: { value: black },
    texel: uniforms.texel, cellSize: uniforms.cellSize, dt: { value: 1 / defaults.simulationHz },
    speed: { value: settings.propagationSpeedPx }, dissipation: { value: settings.dissipation },
    emission: uniforms.emission, density: { value: settings.density }, phase: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader: backgroundShader,
    uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const background = new THREE.Mesh(geometry, material);
  background.name = 'BackgroundRippleDisplay'; background.frustumCulled = false;
  background.renderOrder = -10000; background.visible = false; scene.add(background);
  const seedMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: seedShader,
    uniforms: { mask: { value: null }, texel: { value: new THREE.Vector2() } },
    depthTest: false, depthWrite: false, toneMapped: false });
  const jumpMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: jumpShader,
    uniforms: { field: { value: null }, resolution: { value: new THREE.Vector2() }, jump: { value: 1 } },
    depthTest: false, depthWrite: false, toneMapped: false });
  const packMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: packShader,
    uniforms: { field: { value: null }, mask: { value: null } },
    depthTest: false, depthWrite: false, toneMapped: false });
  const simulationMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: simulationShader,
    uniforms: simulationUniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const passScene = new THREE.Scene(), passCamera = new THREE.Camera();
  const passQuad = new THREE.Mesh(geometry, seedMaterial);
  passQuad.frustumCulled = false; passScene.add(passQuad);

  function saveState() {
    saved.target = renderer.getRenderTarget(); saved.autoClear = renderer.autoClear;
    saved.alpha = renderer.getClearAlpha(); saved.background = scene.background;
    saved.scissorTest = renderer.getScissorTest(); renderer.getClearColor(savedColor);
    renderer.getViewport(savedViewport); renderer.getScissor(savedScissor);
    renderer.autoClear = true; renderer.setScissorTest(false);
  }
  function restoreState() {
    scene.background = saved.background; renderer.autoClear = saved.autoClear;
    renderer.setClearColor(savedColor, saved.alpha); renderer.setRenderTarget(saved.target);
    renderer.setViewport(savedViewport); renderer.setScissor(savedScissor);
    renderer.setScissorTest(saved.scissorTest);
  }
  function resetMovement() {
    motion?.reset(); stepper.reset(); rawSpeed = 0; smoothedSpeed = 0; drive = 0;
    tailRemaining = 0; hasField = false; needsClear = true; sourceReady = false;
    sourceAge = 0; captureElapsed = Infinity; stepsThisFrame = 0;
    sourceUniforms.sourceReady.value = 0; uniforms.strength.value = 0; uniforms.nearStrength.value = 0;
  }
  function releaseTargets() {
    maskTarget?.dispose(); scratch?.forEach(t => t.dispose());
    sourceTargets?.forEach(t => t.dispose()); waveTargets?.forEach(t => t.dispose());
    maskTarget = null; scratch = null; sourceTargets = null; waveTargets = null;
    sourceUniforms.sourceA.value = black; sourceUniforms.sourceB.value = black;
    uniforms.heightField.value = black;
  }
  function resize(width, height) {
    uniforms.viewerSize.value.set(width, height); resetMovement(); releaseTargets();
    if (!available) return;
    const ratio = defaults.maskResolution / Math.max(width, height);
    const w = Math.max(16, Math.round(width * ratio)), h = Math.max(16, Math.round(height * ratio));
    sourceUniforms.fieldSize.value.set(w, h);
    sourceUniforms.referenceSize.value.set(settings.referenceHeight * width / height, settings.referenceHeight);
    uniforms.texel.value.set(1 / w, 1 / h);
    uniforms.cellSize.value.set(sourceUniforms.referenceSize.value.x / w, settings.referenceHeight / h);
    maskTarget = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    const makeField = (filter = THREE.NearestFilter) => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false,
    });
    scratch = [makeField(), makeField()]; sourceTargets = [makeField(), makeField()];
    waveTargets = [makeField(THREE.LinearFilter), makeField(THREE.LinearFilter)];
    seedMaterial.uniforms.mask.value = maskTarget.texture;
    seedMaterial.uniforms.texel.value.copy(uniforms.texel.value);
    jumpMaterial.uniforms.resolution.value.set(w, h); packMaterial.uniforms.mask.value = maskTarget.texture;
    const previous = renderer.getRenderTarget(); renderer.setRenderTarget(scratch[0]);
    const gl = renderer.getContext();
    available = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(previous);
    if (!available) { reason = 'GPU fallback: feedback target unsupported'; releaseTargets(); }
  }
  function captureSource() {
    if (!model || !available || !maskTarget) return false;
    const started = performance.now(); saveState(); hiddenObjects.length = 0;
    scene.traverse(object => {
      if (object.visible && (object.isMesh || object.isSprite || object.isLine || object.isPoints)
        && !headMeshes.has(object)) { hiddenObjects.push(object); object.visible = false; }
    });
    try {
      renderer.setClearColor(0x000000, 0); scene.background = null;
      renderer.setRenderTarget(maskTarget); renderer.render(scene, camera);
      passQuad.material = seedMaterial; renderer.setRenderTarget(scratch[0]); renderer.render(passScene, passCamera);
      let source = 0; passQuad.material = jumpMaterial;
      for (let jump = 2 ** (Math.ceil(Math.log2(Math.max(maskTarget.width, maskTarget.height))) - 1);
        jump >= 1; jump /= 2) {
        jumpMaterial.uniforms.field.value = scratch[source].texture; jumpMaterial.uniforms.jump.value = jump;
        renderer.setRenderTarget(scratch[1 - source]); renderer.render(passScene, passCamera); source = 1 - source;
      }
      sourceIndex = 1 - sourceIndex; passQuad.material = packMaterial;
      packMaterial.uniforms.field.value = scratch[source].texture;
      renderer.setRenderTarget(sourceTargets[sourceIndex]); renderer.render(passScene, passCamera);
      sourceUniforms.sourceA.value = sourceReady ? sourceTargets[1-sourceIndex].texture : sourceTargets[sourceIndex].texture;
      sourceUniforms.sourceB.value = sourceTargets[sourceIndex].texture;
      sourceReady = true; sourceUniforms.sourceReady.value = 1; sourceAge = 0; captureElapsed = 0; captureCount += 1;
      return true;
    } catch (error) {
      available = false; reason = 'GPU fallback: source capture failed';
      console.warn('[background-ripple] Normal background retained.', error); return false;
    } finally {
      for (const object of hiddenObjects) object.visible = true;
      restoreState(); lastCaptureMs = performance.now() - started;
    }
  }
  function simulateStep(dt) {
    phase += dt * settings.propagationSpeedPx * settings.density / settings.referenceHeight * 0.65;
    simulationUniforms.dt.value = dt; simulationUniforms.phase.value = phase;
    simulationUniforms.state.value = waveTargets[waveIndex].texture;
    renderer.setRenderTarget(waveTargets[1-waveIndex]); renderer.render(passScene, passCamera);
    waveIndex = 1-waveIndex;
  }
  function advanceField(delta, aspect) {
    saveState();
    try {
      if (needsClear) {
        renderer.setClearColor(0x000000, 0);
        for (const target of waveTargets) { renderer.setRenderTarget(target); renderer.clear(); }
        waveIndex = 0; needsClear = false; stepper.reset();
      }
      passQuad.material = simulationMaterial;
      simulationUniforms.speed.value = settings.propagationSpeedPx;
      simulationUniforms.dissipation.value = settings.dissipation;
      simulationUniforms.density.value = settings.density;
      const step = getWaveStepSeconds(maskTarget.width, maskTarget.height, aspect,
        settings.referenceHeight, settings.propagationSpeedPx, defaults.simulationHz);
      stepsThisFrame = stepper.advance(delta, step, simulateStep);
      uniforms.heightField.value = waveTargets[waveIndex].texture; hasField = true;
    } catch (error) {
      available = false; reason = 'GPU fallback: simulation failed';
      console.warn('[background-ripple] Normal background retained.', error);
    } finally { restoreState(); }
  }
  document.addEventListener('visibilitychange', resetMovement);
  reducedMotion.addEventListener('change', resetMovement);
  function update(delta) {
    const canRender = available && settings.enabled && !reducedMotion.matches && !postProcessing.enabled;
    const videoReady = videoBackground.ready;
    background.visible = canRender && (videoReady || placeholderReady);
    if (!background.visible || document.hidden) {
      if (!suspended) resetMovement(); suspended = true; return;
    }
    suspended = false;
    uniforms.backgroundMap.value = videoReady ? videoTexture : placeholderTexture;
    const image = videoReady ? videoBackground.video : placeholderTexture.image;
    const imageAspect = (image.videoWidth || image.width) / (image.videoHeight || image.height);
    const aspect = uniforms.viewerSize.value.x / uniforms.viewerSize.value.y;
    uniforms.coverScale.value.set(Math.min(1, aspect/imageAspect), Math.min(1, imageAspect/aspect));
    if (backgroundGrain.revision !== grainRevision && grainTexture !== neutralGrain) {
      grainRevision = backgroundGrain.revision; grainTexture.needsUpdate = true;
    }
    const dt = Math.min(Math.max(delta, 0), 0.1);
    rawSpeed = motion?.sample(dt, aspect) ?? 0;
    smoothedSpeed = THREE.MathUtils.damp(smoothedSpeed, rawSpeed, 1 / Math.max(settings.movementSmoothing, 0.001), dt);
    drive = getMovementDrive(smoothedSpeed, settings); uniforms.emission.value = drive;
    captureElapsed += dt; sourceAge += dt; stepsThisFrame = 0;
    if (drive > 0.0005) {
      tailRemaining = Math.max(6, 8 / settings.dissipation);
      if (rawSpeed > 0.1 && (!sourceReady || captureElapsed >= 1 / defaults.silhouetteUpdateHz)) captureSource();
    } else tailRemaining = Math.max(0, tailRemaining - dt);
    sourceUniforms.sourceBlend.value = THREE.MathUtils.smootherstep(sourceAge, 0, 1 / defaults.silhouetteUpdateHz);
    if (sourceReady && tailRemaining > 0 && available) advanceField(dt, aspect);
    else if (hasField) { hasField = false; needsClear = true; stepper.reset(); }
    const scale = uniforms.viewerSize.value.y / settings.referenceHeight;
    // Only the final imperceptible residual is faded before stopping idle GPU
    // work. This never runs as an individual-emission envelope during motion.
    const residualFade = drive > 0.0005 ? 1 : THREE.MathUtils.smootherstep(tailRemaining, 0, 1);
    uniforms.strength.value = hasField ? settings.strengthPx * scale * residualFade : 0;
    uniforms.nearStrength.value = hasField ? settings.nearHeadStrengthPx * scale * residualFade : 0;
    uniforms.displacementLimit.value = Math.max(16, settings.strengthPx + settings.nearHeadStrengthPx) * 1.4 * scale;
    if (!available) background.visible = false;
  }
  return {
    settings, update, resize,
    setModel(root) {
      model = root; headMeshes.clear(); root.traverse(object => { if (object.isMesh) headMeshes.add(object); });
      const rigidHead = root.getObjectByName('head_LowPoly') ?? root.getObjectByName('HEAD_ANIMATION_ROOT') ?? root;
      motion = createProjectedHeadMotion(rigidHead, camera, settings.referenceHeight); resetMovement();
    },
    get supported() { return available && !reducedMotion.matches && !postProcessing.enabled; },
    get status() {
      if (!settings.enabled) return 'Disabled — normal HTML background';
      if (reducedMotion.matches) return 'Reduced motion — static background';
      if (postProcessing.enabled) return 'FXAA mode — normal background fallback';
      return `${reason} · speed ${smoothedSpeed.toFixed(1)} reference px/s · source ${(drive*100).toFixed(1)}%` +
        ` · ${stepsThisFrame} feedback steps/frame · captures ${captureCount} · field ${maskTarget?.width ?? 0}×${maskTarget?.height ?? 0}` +
        ` · last capture CPU ${lastCaptureMs.toFixed(1)}ms`;
    },
    dispose() {
      document.removeEventListener('visibilitychange', resetMovement); reducedMotion.removeEventListener('change', resetMovement);
      scene.remove(background); releaseTargets(); geometry.dispose(); material.dispose(); seedMaterial.dispose();
      jumpMaterial.dispose(); packMaterial.dispose(); simulationMaterial.dispose(); videoTexture.dispose(); placeholderTexture.dispose();
      if (grainTexture !== neutralGrain) grainTexture.dispose(); black.dispose(); neutralGrain.dispose();
    },
  };
}
