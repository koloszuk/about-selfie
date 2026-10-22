import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './createEnvironment.js';
import { createPostProcessing } from './createPostProcessing.js';
import { IS_EMBED_MODE, getPublicAssetUrl } from '../runtime/embedMode.js';
import { PRESENTATION_CONFIG } from './presentationConfig.js';
import { createCameraFraming } from './createCameraFraming.js';

export const BACKGROUND_COLORS = Object.freeze({
  bright: 0xe9e7e2,
  dark: 0x171717,
});
export const BACKGROUND_MODE_DEFAULT = 'dark';
const MAX_PIXEL_RATIO = 2;

export const SUPPLEMENTARY_LIGHTS_ENABLED = true;
export const HEMISPHERE_LIGHT_INTENSITY = 1.7;
export const KEY_LIGHT_INTENSITY = 2.8;
export const FILL_LIGHT_INTENSITY = 1.2;
export const RIM_LIGHT_INTENSITY = 1.4;

export function createExperience(container) {
  const scene = new THREE.Scene();
  const backgroundColor = new THREE.Color(BACKGROUND_COLORS[BACKGROUND_MODE_DEFAULT]);
  container.style.backgroundImage = `url("${getPublicAssetUrl(PRESENTATION_CONFIG.backgroundAsset)}")`;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  if (IS_EMBED_MODE) {
    scene.background = null;
    container.style.backgroundColor = 'transparent';
    container.dataset.embedMode = 'true';
  } else {
    scene.background = backgroundColor;
    container.style.backgroundColor = `#${backgroundColor.getHexString()}`;
  }
  // The image is a viewer layer, independent of orbit and environment lighting.
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0.05, 7.2);
  // Camera-attached lights must share the scene graph with the rendered model
  // so Object3D.attach() can preserve their world transform.
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D head');
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus(), {
    passive: true,
  });
  const contextAttributes = renderer.getContext().getContextAttributes();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' &&
    renderer.getContext() instanceof WebGL2RenderingContext;
  console.info('[renderer/alpha]', JSON.stringify({
    canvasAlpha: contextAttributes.alpha,
    premultipliedAlpha: contextAttributes.premultipliedAlpha,
    antialias: contextAttributes.antialias,
    webgl2: isWebGL2,
    hairPipeline: 'straight alpha',
  }));
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 8;
  controls.target.set(0, 0, 0);
  const framing = createCameraFraming({ camera, controls, config: PRESENTATION_CONFIG.camera });

  const lighting = addLighting(scene);
  const environment = createEnvironment({ scene, controls });
  const postProcessing = createPostProcessing({ renderer, scene, camera });
  let hasLoggedPixelRatio = false;

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    framing.resize(width, height);
    const devicePixelRatio = window.devicePixelRatio;
    const pixelRatio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    postProcessing.setSize(width, height, pixelRatio);
    renderer.domElement.dataset.devicePixelRatio = String(devicePixelRatio);
    renderer.domElement.dataset.rendererPixelRatio = String(renderer.getPixelRatio());
    if (!hasLoggedPixelRatio) {
      hasLoggedPixelRatio = true;
      console.info('[renderer/dpr]', {
        devicePixelRatio,
        rendererPixelRatio: renderer.getPixelRatio(),
        maximumPixelRatio: MAX_PIXEL_RATIO,
        matched: renderer.getPixelRatio() === devicePixelRatio,
      });
    }
  }

  // Establish the correct projection before setAnimationLoop can render its
  // first frame, then track layout-driven size changes as well as DPR changes.
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);

  function dispose() {
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    controls.dispose();
    environment.dispose();
    postProcessing.dispose();
    renderer.dispose();
  }

  function setBackgroundMode(mode) {
    if (IS_EMBED_MODE) return;
    const color = BACKGROUND_COLORS[mode] ?? BACKGROUND_COLORS[BACKGROUND_MODE_DEFAULT];
    backgroundColor.setHex(color);
    scene.background = null;
    container.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
  }

  return {
    scene, camera, renderer, controls, environment, lighting, postProcessing,
    resize, setBackgroundMode, dispose,
    frameModel(model) {
      framing.setModel(model);
      resize();
    },
  };
}

function addLighting(scene) {
  if (!SUPPLEMENTARY_LIGHTS_ENABLED) {
    return { lights: [], frontal: null, setFrontalEnabled() {} };
  }

  const hemisphere = new THREE.HemisphereLight(
    0xffffff,
    0xb8b1a8,
    HEMISPHERE_LIGHT_INTENSITY,
  );
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff8ee, KEY_LIGHT_INTENSITY);
  key.name = 'CodeKeyLight';
  key.position.set(3, 4, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcbd8e6, FILL_LIGHT_INTENSITY);
  fill.position.set(-4, 1.5, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, RIM_LIGHT_INTENSITY);
  rim.position.set(0, 3, -4);
  scene.add(rim);

  return {
    lights: [hemisphere, key, fill, rim],
    frontal: key,
    setFrontalEnabled(value) {
      key.visible = value;
    },
  };
}
