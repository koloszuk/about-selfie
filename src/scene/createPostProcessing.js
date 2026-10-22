import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Append ?fxaa=0 or ?fxaa=1 to the preview URL for a quick raw/FXAA A/B.
export const FXAA_ENABLED_DEFAULT = false;

export function createPostProcessing({ renderer, scene, camera }) {
  const context = renderer.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' &&
    context instanceof WebGL2RenderingContext;
  const maximumSamples = isWebGL2 ? context.getParameter(context.MAX_SAMPLES) : 0;
  const defaultFramebufferSamples = context.getParameter(context.SAMPLES) ?? 0;
  const composerSamples = isWebGL2
    ? Math.min(defaultFramebufferSamples, maximumSamples)
    : 0;
  const renderTarget = new THREE.WebGLRenderTarget(1, 1);
  renderTarget.samples = composerSamples;

  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  const fxaaPass = new ShaderPass(FXAAShader);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(fxaaPass);
  composer.addPass(outputPass);

  const requestedMode = new URLSearchParams(window.location.search).get('fxaa');
  let enabled = requestedMode === '0'
    ? false
    : requestedMode === '1'
      ? true
      : FXAA_ENABLED_DEFAULT;

  // Composer performs more than one renderer.render() call. Disable Three's
  // per-call reset so renderer.info contains the aggregate scene + FXAA work.
  renderer.info.autoReset = false;

  function setSize(width, height, pixelRatio) {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    const safePixelRatio = Math.max(pixelRatio, 1);
    composer.setPixelRatio(safePixelRatio);
    composer.setSize(safeWidth, safeHeight);
    fxaaPass.material.uniforms.resolution.value.set(
      1 / (safeWidth * safePixelRatio),
      1 / (safeHeight * safePixelRatio),
    );
  }

  function render(deltaTime) {
    renderer.info.reset();
    if (enabled) composer.render(deltaTime);
    else renderer.render(scene, camera);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    renderer.domElement.dataset.fxaaEnabled = String(enabled);
  }

  const diagnostics = Object.freeze({
    webgl2: isWebGL2,
    antialiasRequested: Boolean(context.getContextAttributes()?.antialias),
    defaultFramebufferSamples,
    maximumSamples,
    composerSamples,
  });
  console.info('[renderer/aa]', {
    ...diagnostics,
    fxaaEnabled: enabled,
    note: 'WebGLRenderer constructor does not expose a sample-count option; antialias:true selects the browser default.',
  });
  renderer.domElement.dataset.fxaaEnabled = String(enabled);
  renderer.domElement.dataset.msaaSamples = String(defaultFramebufferSamples);
  renderer.domElement.dataset.msaaMaxSamples = String(maximumSamples);
  renderer.domElement.dataset.composerSamples = String(composerSamples);

  return {
    composer,
    fxaaPass,
    diagnostics,
    setSize,
    setEnabled,
    render,
    get enabled() { return enabled; },
    dispose() {
      renderPass.dispose?.();
      fxaaPass.dispose?.();
      outputPass.dispose?.();
      composer.dispose();
    },
  };
}
