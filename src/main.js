import * as THREE from 'three';
import './style.css';
import './ui/compactUi.css';
import { createBlinkController } from './animation/createBlinkController.js';
import { createIdleController } from './animation/createIdleController.js';
import { createBrowDeformer } from './deformation/createBrowDeformer.js';
import { initializeHairSurfaceBinding } from './deformation/createHairSurfaceBinding.js';
import { createHeadDeformer } from './deformation/createHeadDeformer.js';
import { createDeformationControls } from './interaction/createDeformationControls.js';
import { createEyeFollower } from './interaction/createEyeFollower.js';
import { initializeEyeHoverClose } from './interaction/createEyeHoverClose.js';
import { createHeadFollower } from './interaction/createHeadFollower.js';
import { createPointerTracker } from './interaction/createPointerTracker.js';
import { BACKGROUND_MODE_DEFAULT, createExperience } from './scene/createExperience.js';
import { createCameraLightFollower } from './scene/createCameraLightFollower.js';
import { createHead } from './scene/createHead.js';
import { createDeformationModeControl } from './ui/createDeformationModeControl.js';
import { createAdvancedSettings } from './ui/createAdvancedSettings.js';
import { createBlinkDebugControl } from './ui/createBlinkDebugControl.js';
import { createDeformationRangeTuningControl } from './ui/createDeformationRangeTuningControl.js';
import { createSpringDebugControl } from './ui/createSpringDebugControl.js';
import { createFollowToggle } from './ui/createFollowToggle.js';
import { createCameraLightDebugControl } from './ui/createCameraLightDebugControl.js';
import { createWiggleControl } from './ui/createWiggleControl.js';
import { createWiggleDebugControl } from './ui/createWiggleDebugControl.js';
import { createPerformanceAnalytics } from './ui/createPerformanceAnalytics.js';
import { createKeyboardModeControl } from './ui/createKeyboardModeControl.js';
import { createHairAlphaDebugControl } from './ui/createHairAlphaDebugControl.js';
import { createBackgroundToggle } from './ui/createBackgroundToggle.js';
import { createHairMaterialTuningControl } from './ui/createHairMaterialTuningControl.js';
import { createSquintingControl } from './ui/createSquintingControl.js';
import { SQUINTING_CONFIG } from './interaction/squintingConfig.js';
import { createIdleDebugControl } from './ui/createIdleDebugControl.js';
import { createEyeAlignController } from './interaction/createEyeAlignController.js';
import { createEyeAlignControl } from './ui/createEyeAlignControl.js';
import { ENABLE_DEFORMATION_RANGE_TUNING_UI } from './interaction/deformationControlConfig.js';
import { IS_EMBED_MODE } from './runtime/embedMode.js';
import { createCompactUi } from './ui/createCompactUi.js';
import { createAutoOrbit } from './scene/createAutoOrbit.js';
import { PRESENTATION_CONFIG } from './scene/presentationConfig.js';
import { createBackgroundRippleControl } from './ui/createBackgroundRippleControl.js';
import { createFrameProfiler } from './scene/createFrameProfiler.js';
import { createUpperEyelidTracking } from './interaction/createUpperEyelidTracking.js';
import { createUpperEyelidTrackingControl } from './ui/createUpperEyelidTrackingControl.js';
import { createMicroSaccades } from './interaction/createMicroSaccades.js';
import { createMicroSaccadesControl } from './ui/createMicroSaccadesControl.js';

const container = document.querySelector('#app');
const status = document.querySelector('#status');
let experience = null;
try {
  experience = createExperience(container);
} catch (error) {
  console.error('WebGL is unavailable:', error);
  status.hidden = false;
  status.classList.add('is-error');
  status.textContent = 'This interactive head needs WebGL. Please try a browser with hardware acceleration enabled.';
}
const pointer = experience ? createPointerTracker(experience.renderer.domElement) : null;
const clock = new THREE.Clock();
const frameProfiler = experience ? createFrameProfiler(experience.renderer, experience.backgroundRipple,
  () => idleController?.registerInteraction()) : null;
let eyeFollower;
let deformationControls;
let headDeformer;
let browDeformer;
let headFollower;
let blinkController;
let springDebugControl;
let rangeTuningControl;
let blinkDebugControl;
let cameraLightFollower;
let cameraLightDebugControl;
let wiggleControl;
let wiggleDebugControl;
let performanceAnalytics;
let hairSurfaceBinding;
let eyeHoverClose;
let keyboardModeControl;
let idleController;
let hairAlphaDebugControl;
let hairMaterialTuningControl;
let squintingControl;
let idleDebugControl;
let eyeAlignController;
let eyeAlignControl;
let autoOrbit;
let backgroundRippleControl;
let upperEyelidTracking;
let microSaccades;

async function initialize() {
  status.hidden = false;
  status.textContent = 'Loading head and environment…';
  const environmentPromise = experience.environment.load().catch(() => null);

  try {
    const head = await createHead(undefined, { renderer: experience.renderer });
    const modelInfo = head.userData.inspection;
    const advancedSettings = createAdvancedSettings(container);
    backgroundRippleControl = createBackgroundRippleControl(
      advancedSettings.getSection('backgroundRipple'), experience.backgroundRipple,
    );
    const compactUi = createCompactUi(container, { reserveTopSpace: !IS_EMBED_MODE });
    if (!IS_EMBED_MODE) {
      createBackgroundToggle(container, experience.setBackgroundMode, {
        defaultMode: BACKGROUND_MODE_DEFAULT,
      });
    }
    hairAlphaDebugControl = createHairAlphaDebugControl(
      advancedSettings.getSection('hair'),
      modelInfo.hairAlphaInspection,
    );
    hairMaterialTuningControl = createHairMaterialTuningControl(
      advancedSettings.getSection('hairMaterial'),
      modelInfo.hairAlphaInspection,
    );
    squintingControl = createSquintingControl(
      advancedSettings.getSection('squinting'),
      SQUINTING_CONFIG,
    );
    const hasImportedFrontalLight = modelInfo.importedLights.length > 0;
    for (const light of modelInfo.importedLights) {
      experience.scene.attach(light);
    }
    experience.lighting.setFrontalEnabled(!hasImportedFrontalLight);
    modelInfo.duplicateFrontalLightRemoved = hasImportedFrontalLight;
    headFollower = createHeadFollower({
      scene: experience.scene,
      head,
      pointer,
      controls: experience.controls,
    });
    cameraLightFollower = createCameraLightFollower({
      scene: experience.scene,
      camera: experience.camera,
      head,
      importedLights: modelInfo.importedLights,
      fallbackLight: experience.lighting.frontal,
    });
    experience.frameModel(head);
    autoOrbit = createAutoOrbit({
      camera: experience.camera, controls: experience.controls,
      canvas: experience.renderer.domElement, pointer,
      model: head, config: PRESENTATION_CONFIG.autoOrbit,
    });
    cameraLightDebugControl = createCameraLightDebugControl(
      advancedSettings.getSection('light'), cameraLightFollower,
    );
    blinkController = createBlinkController({
      root: head,
      clips: modelInfo.animations,
      headMesh: modelInfo.headMesh,
    });
    blinkDebugControl = createBlinkDebugControl(advancedSettings.getSection('blink'), blinkController);

    headDeformer = createHeadDeformer(head);
    hairSurfaceBinding?.dispose?.();
    hairSurfaceBinding = initializeHairSurfaceBinding({
      modelRoot: head,
      headMesh: headDeformer.mesh,
      originalPositions: headDeformer.originalPositions,
    });
    eyeFollower = createEyeFollower({
      head,
      pointer,
      camera: experience.camera,
    });
    microSaccades = createMicroSaccades({
      pointer, applyOffset: eyeFollower.applyMicroSaccade,
      observeElement: experience.renderer.domElement,
    });
    createMicroSaccadesControl(advancedSettings.getSection('microSaccades'), microSaccades);
    eyeAlignController = createEyeAlignController({
      eyePivots: eyeFollower.eyePivots,
    });
    eyeAlignControl = createEyeAlignControl(
      advancedSettings.getSection('eyeAlign'),
      eyeAlignController,
    );
    eyeHoverClose?.dispose?.();
    eyeHoverClose = initializeEyeHoverClose({
      modelRoot: head,
      camera: experience.camera,
      canvas: experience.renderer.domElement,
      pointer,
      headReactionConfig: headFollower.eyeHoverReactionConfig,
      onHeadReactionTargetChange: headFollower.setEyeHoverReactionTarget,
      onFaceHoverAmountsChange: (leftAmount, rightAmount) =>
        deformationControls?.setEyeHoverFaceReaction(leftAmount, rightAmount),
      onEyeClick: () => blinkController?.playNow(),
      isInteractionCursorReserved: () =>
        deformationControls?.isInteractionCursorReserved?.() ?? false,
    });
    browDeformer = createBrowDeformer({
      deformer: headDeformer,
      gaze: eyeFollower.gaze,
    });
    upperEyelidTracking = createUpperEyelidTracking({
      deformer: headDeformer, eyePivots: eyeFollower.eyePivots, eyeHoverClose,
    });
    createUpperEyelidTrackingControl(advancedSettings.getSection('upperEyelid'), upperEyelidTracking);
    deformationControls = createDeformationControls({
      deformer: headDeformer,
      model: head,
      camera: experience.camera,
      canvas: experience.renderer.domElement,
      controls: experience.controls,
      pointer,
      onDragStart: () => headFollower.setInteractionPaused(true),
      onDragEnd: () => headFollower.setInteractionPaused(false),
    });
    createFollowToggle(
      advancedSettings.getSection('follow'),
      eyeFollower.setEnabled,
    );
    wiggleControl = createWiggleControl(compactUi.element, deformationControls, advancedSettings.getSection('wiggle'));
    const deformationModeControl = createDeformationModeControl(compactUi.element, deformationControls.setMode);
    keyboardModeControl = createKeyboardModeControl(
      compactUi.element,
      deformationControls,
      blinkController,
      eyeFollower,
      advancedSettings.getSection('keyboard'),
    );
    springDebugControl = createSpringDebugControl(
      advancedSettings.getSection('spring'),
      deformationControls,
      deformationModeControl.setActiveMode,
    );
    if (ENABLE_DEFORMATION_RANGE_TUNING_UI) {
      rangeTuningControl = createDeformationRangeTuningControl(
        advancedSettings.getSection('range'), deformationControls,
      );
    }
    wiggleDebugControl = createWiggleDebugControl(
      advancedSettings.getSection('wiggle'), deformationControls,
    );
    performanceAnalytics = createPerformanceAnalytics(
      advancedSettings.getSection('performance'),
      {
        renderer: experience.renderer,
        deformer: headDeformer,
        controls: deformationControls,
        asset: modelInfo.asset,
      },
    );
    idleController = createIdleController({
      root: head,
      clips: modelInfo.animations,
      canvas: experience.renderer.domElement,
      interactionRoot: container,
      controls: experience.controls,
      blinkController,
      onIdleStateChange(isIdle) {
        headFollower?.setIdleMode(isIdle);
        eyeFollower?.setIdleMode(isIdle);
      },
    });
    idleDebugControl = createIdleDebugControl(
      advancedSettings.getSection('idle'),
      idleController,
    );
    if (!idleController.clip) {
      showModelWarning('Idle_Main is missing from head.glb; authored idle playback is disabled.');
    }
    if (!blinkController.clip) {
      showModelWarning(
        blinkController.validationMessage,
      );
    }
    if (deformationControls.hasMissingAuthoredMasks) {
      showModelWarning(
        `Strict authored-mask mode disabled controls with missing attributes: ` +
          `${deformationControls.missingAuthoredMasks.join(', ')}. No radius fallback was used.`,
      );
    } else if (deformationControls.usesFallbackMasks) {
      showModelWarning(
        'Painted CTRL_* weights were not exported as named GLB attributes. ' +
          'Blender PICK_* anchors are active; deformation is temporarily using radius fallbacks.',
      );
    }

    await environmentPromise;
    status.hidden = true;
  } catch (error) {
    await environmentPromise;
    console.error('Unable to load the head model:', error);
    status.textContent = 'Could not load head.glb';
    status.classList.add('is-error');
  }
}

function animate() {
  frameProfiler?.beginFrame();
  const delta = Math.min(clock.getDelta(), 0.1);
  performanceAnalytics?.beginFrame();
  experience.controls.update();
  if (!frameProfiler?.controlsCamera) autoOrbit?.update(delta);
  frameProfiler?.updateCamera(experience.camera, experience.controls);
  experience.environment.update();
  idleController?.update(delta);
  headFollower?.update(delta);
  cameraLightFollower?.update();
  cameraLightDebugControl?.update();
  headDeformer?.beginFrame();
  blinkController?.update(delta);
  blinkDebugControl?.update();
  eyeFollower?.updateGaze(delta);
  browDeformer?.update();
  if (!idleController?.active) eyeHoverClose?.updateEyeHoverClose(delta);
  else deformationControls?.setEyeHoverFaceReaction(0, 0);
  deformationControls?.update(delta, performanceAnalytics);
  headFollower?.updateEyeHoverReaction(delta);
  headFollower?.root.updateWorldMatrix(true, true);
  const eyeHoverAlignmentActive = Boolean(
    eyeHoverClose?.leftEye?.isPointerInsideOuterRadius ||
    eyeHoverClose?.rightEye?.isPointerInsideOuterRadius,
  );
  const eyeAlignmentInteractionActive = Boolean(
    eyeFollower?.alignmentInputActive ||
    eyeHoverAlignmentActive ||
    deformationControls?.isInteractionCursorReserved?.(),
  );
  eyeAlignController?.prepareInteractionTransition({
    idleBlend: idleController?.alignmentBlend ?? 0,
    interactionActive: eyeAlignmentInteractionActive,
  });
  eyeFollower?.updateEyes(delta);
  eyeAlignController?.update({
    idleBlend: idleController?.alignmentBlend ?? 0,
    interactionActive: eyeAlignmentInteractionActive,
    deltaTime: delta,
  });
  microSaccades?.update(delta, idleController?.alignmentBlend ?? 0, document.hidden);
  upperEyelidTracking?.update(delta);
  headDeformer?.commit();
  hairSurfaceBinding?.updateHairSurfaceBinding();
  springDebugControl?.update();
  rangeTuningControl?.update();
  wiggleControl?.update();
  wiggleDebugControl?.update();
  keyboardModeControl?.update();
  idleDebugControl?.update();

  // Add per-frame deformation updates here before rendering.
  const renderStart = performanceAnalytics ? performance.now() : 0;
  frameProfiler?.beginRipple();
  experience.backgroundRipple.update(delta);
  frameProfiler?.endRipple();
  backgroundRippleControl?.update(delta);
  experience.postProcessing.render(delta);
  if (performanceAnalytics) performanceAnalytics.recordRender(performance.now() - renderStart);
  performanceAnalytics?.endFrame(delta);
  frameProfiler?.endFrame();
}

if (experience) {
  experience.renderer.setAnimationLoop(animate);
  initialize();
}

function showModelWarning(message) {
  const warning = document.createElement('aside');
  warning.className = 'model-warning';
  warning.setAttribute('role', 'status');
  warning.textContent = message;
  container.appendChild(warning);
}
