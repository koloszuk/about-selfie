import * as THREE from 'three';
import {
  DEFAULT_DEFORMATION_MODE,
  DEPTH_DRAG_UNITS_PER_PIXEL,
  DEFORMATION_CONTROL_CONFIGS,
  HANDLE_VISIBILITY_RADIUS_MULTIPLIER,
  HANDLE_VISUAL_CONFIG,
  RELEASE_IMPULSE,
  RELEASE_MAX_DELTA_TIME,
  RELEASE_MAX_OVERSHOOT_MULTIPLIER,
  RELEASE_SETTLE_EPSILON,
  RELEASE_SPRING_DAMPING,
  RELEASE_SPRING_MASS,
  RELEASE_SPRING_STIFFNESS,
  WEIGHT_GAMMA,
  WEIGHT_GAIN,
  WEIGHT_REMAP_MODE,
  USE_STRICT_AUTHORED_MASKS,
  WEIGHT_EPSILON,
  WIGGLE_CONTROL_RESTORE_DURATION,
  WIGGLE_DRAG_RESUME_SECONDS,
  WIGGLE_BOUNDARY_MARGIN,
  WIGGLE_RANGE_ADAPT_SECONDS,
  WIGGLE_DEFAULT_INTENSITY,
  WIGGLE_DEFAULT_SPEED,
  WIGGLE_DIRECT_FOLLOW_FULL_SPEED,
  WIGGLE_DIRECT_FOLLOW_START_SPEED,
  WIGGLE_FADE_DURATION,
  WIGGLE_MAX_DAMPING_MULTIPLIER,
  WIGGLE_MAX_DIRECT_FOLLOW_BLEND,
  WIGGLE_MAX_FREQUENCY_HZ,
  WIGGLE_MAX_PHASE_SPEED,
  WIGGLE_MAX_RANGE_FRACTION,
  WIGGLE_MAX_STIFFNESS_MULTIPLIER,
  WIGGLE_MAX_SUBSTEP_SECONDS,
  WIGGLE_MIN_DAMPING_MULTIPLIER,
  WIGGLE_MIN_STIFFNESS_MULTIPLIER,
  WIGGLE_REFERENCE_SPEED,
  WIGGLE_SPRING_DAMPING,
  WIGGLE_SPRING_MASS,
  WIGGLE_SPRING_STIFFNESS,
  WIGGLE_SPEED_CURVE_EXPONENT,
  KEYBOARD_MODE_CONFIG,
  remapWeight,
} from './deformationControlConfig.js';
import {
  getRangedSquintStrength,
  SQUINTING_CONFIG,
} from './squintingConfig.js';

const {
  maxOpacity: HANDLE_MAX_OPACITY, closeOpacity: HANDLE_CLOSE_OPACITY,
  dragOpacity: HANDLE_DRAG_OPACITY, smoothing: HANDLE_SMOOTHING,
  minScale: HANDLE_MIN_SCALE, revealedScale: HANDLE_REVEALED_SCALE,
  closeScale: HANDLE_CLOSE_SCALE, closeVisibilityRadiusRatio: HANDLE_CLOSE_VISIBILITY_RADIUS_RATIO,
  dragScale: HANDLE_DRAG_SCALE,
} = HANDLE_VISUAL_CONFIG;
const LABEL_LOCAL_Y_OFFSET = 3.6;
export const OCCLUSION_EPSILON = 0.12;
export const SHOW_PICK_POINTS_DEFAULT = false;
export const SHOW_OCCLUDED_PICK_POINTS_DEFAULT = false;
const OCCLUDED_MARKER_COLOR = 0xa85d66;
const VISIBLE_MARKER_COLOR = 0x4a9bff;
const HOVER_MARKER_COLOR = 0x78bdff;
const ELLIPSOID_RADIUS_EPSILON = 1e-6;
const EYE_HOVER_FACE_CONTROL_IDS = Object.freeze([
  'mouthLeft', 'mouthRight',
  'cheekLeft', 'cheekRight',
  'eyebrowLeft', 'eyebrowRight',
]);

export function createDeformationControls({
  deformer,
  model,
  camera,
  canvas,
  controls,
  pointer,
  onDragStart,
  onDragEnd,
}) {
  const headMesh = deformer.mesh;
  const markerTexture = createCircleTexture();
  const markerParentScale = new THREE.Vector3();
  const controlStates = DEFORMATION_CONTROL_CONFIGS.map((config) =>
    createControlState(config, deformer, markerTexture, model),
  );
  const controlStatesById = new Map(controlStates.map((state) => [state.id, state]));
  const debugHelper = createDebugHelper(headMesh, deformer.originalPositions, controlStates);
  const limitDebugHelper = createLimitDebugHelper(headMesh, controlStates);
  const raycaster = new THREE.Raycaster();
  const occlusionRaycaster = new THREE.Raycaster();
  const occlusionIntersections = [];
  const cameraWorldPosition = new THREE.Vector3();
  const occlusionDirection = new THREE.Vector3();
  const dragPlane = new THREE.Plane();
  const dragPlaneNormal = new THREE.Vector3();
  const dragStartWorld = new THREE.Vector3();
  const dragCurrentWorld = new THREE.Vector3();
  const dragStartLocal = new THREE.Vector3();
  const dragCurrentLocal = new THREE.Vector3();
  const dragWorldDelta = new THREE.Vector3();
  let mode = DEFAULT_DEFORMATION_MODE;
  let hoveredControl = null;
  let draggingControl = null;
  let activePointerId = null;
  let forceMarkersVisible = SHOW_PICK_POINTS_DEFAULT;
  let labelsVisible = false;
  let showOccludedMarkers = SHOW_OCCLUDED_PICK_POINTS_DEFAULT;
  let handleVisibilityRadiusMultiplier = HANDLE_VISIBILITY_RADIUS_MULTIPLIER;
  let dragDepthMode = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  const springSettings = {
    stiffness: RELEASE_SPRING_STIFFNESS,
    damping: RELEASE_SPRING_DAMPING,
    mass: RELEASE_SPRING_MASS,
    impulse: RELEASE_IMPULSE,
    maxOvershootMultiplier: RELEASE_MAX_OVERSHOOT_MULTIPLIER,
    settleEpsilon: RELEASE_SETTLE_EPSILON,
  };
  const wiggleSettings = {
    enabled: false,
    speed: WIGGLE_DEFAULT_SPEED,
    intensity: WIGGLE_DEFAULT_INTENSITY,
    stiffness: WIGGLE_SPRING_STIFFNESS,
    damping: WIGGLE_SPRING_DAMPING,
    mass: WIGGLE_SPRING_MASS,
    fadeDuration: WIGGLE_FADE_DURATION,
    maxRangeFraction: WIGGLE_MAX_RANGE_FRACTION,
    frequencyCompensation: true,
    globalBlend: 0,
    time: 0,
    oscillatorSpeed: WIGGLE_DEFAULT_SPEED,
    frequencyHz: 0,
    speedRatio: 1,
    effectiveStiffness: WIGGLE_SPRING_STIFFNESS,
    effectiveDamping: WIGGLE_SPRING_DAMPING,
    directFollowBlend: 0,
    integrationSubsteps: 1,
  };
  let wiggleTime = 0;
  let wiggleGlobalBlend = 0;
  let handlesInsideVisibilityRadius = 0;
  let occlusionRaysThisFrame = 0;
  const keyboardSettings = KEYBOARD_MODE_CONFIG;
  let keyboardDistortionMultiplier = keyboardSettings.distortionMultiplierDefault;

  canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerLeave);

  console.info('[controls] deformation controls:', controlStates.map(summarizeControl));
  console.info(
    '[controls] Rebuilt all compact influence lists from the newly loaded model.',
    controlStates.map((state) => ({
      id: state.id,
      source: state.influence.source,
      affectedVertices: state.influence.indices.length,
    })),
  );
  console.info('[weights] Raw → effective representative samples:', getRepresentativeWeightMapping());
  for (const state of controlStates.filter((control) =>
    ['cheekLeft', 'cheekRight', 'forehead', 'bridge', 'mouthCenter'].includes(control.id))) {
    console.info(
      `[controls] ${state.label}: ${state.active ? 'ACTIVE' : 'INACTIVE'}; ` +
      `anchor ${state.pickAnchor ? 'FOUND' : 'MISSING'}; mask ${state.influence.attributeName ?? 'MISSING'}; ` +
      `influenced vertices ${state.influence.indices.length}; ` +
      `raw non-zero range ${state.influence.minImportedWeight}–${state.influence.maxImportedWeight}; ` +
      `effective range ${state.influence.minWeight}–${state.influence.maxWeight}`,
    );
  }

  function update(delta, analytics) {
    const detailedTimings = analytics?.detailedTimings;
    let timerStart = detailedTimings ? performance.now() : 0;
    for (const state of controlStates) {
      if (!state.active) continue;
      updateSpring(state, delta);
      updateKeyboardPulse(state, delta);
    }
    if (detailedTimings) analytics.record('spring', performance.now() - timerStart);

    timerStart = detailedTimings ? performance.now() : 0;
    updateWiggle(delta);
    if (detailedTimings) analytics.record('wiggle', performance.now() - timerStart);

    timerStart = detailedTimings ? performance.now() : 0;
    for (const state of controlStates) {
      if (!state.active) continue;
      resolveAppliedOffset(state);
      deformer.addInfluence(
        state.influence.indices,
        state.influence.weights,
        state.finalAppliedOffset.x * state.config.strength,
        state.finalAppliedOffset.y * state.config.strength,
        state.finalAppliedOffset.z * state.config.strength,
      );
      updateHandlePosition(state);
    }
    if (detailedTimings) analytics.record('vertex', performance.now() - timerStart);

    timerStart = detailedTimings ? performance.now() : 0;
    updateProximityStates();
    updateOcclusionStates();
    updateEligibilityStates();
    hoveredControl = draggingControl ?? findNearestControl();
    const interpolation = 1 - Math.exp(-HANDLE_SMOOTHING * delta);
    // Sprite sizeAttenuation=false removes distance but not projection/model
    // scale. Compensate those factors to keep a stable CSS-pixel visual radius.
    deformer.mesh.getWorldScale(markerParentScale);
    const markerScreenScale = HANDLE_VISUAL_CONFIG.radiusPx * 4 /
      (0.72 * Math.max(canvas.clientHeight, 1) * camera.projectionMatrix.elements[5] *
        Math.max(Math.abs(markerParentScale.y), 1e-8));
    for (const state of controlStates) {
      if (!state.active) {
        state.material.opacity = 0;
        state.labelSprite.visible = false;
        continue;
      }
      const isHovered = state === hoveredControl;
      const isDragging = state === draggingControl;
      const isOccluded = state.occluded && !isDragging;
      const active = isDragging || (!isOccluded && (forceMarkersVisible || state.visibilityProgress > 0)) ||
        (isOccluded && showOccludedMarkers);
      const targetOpacity = isOccluded
        ? (showOccludedMarkers ? 0.2 : 0)
        : isDragging ? HANDLE_DRAG_OPACITY
          : forceMarkersVisible ? HANDLE_MAX_OPACITY
            : THREE.MathUtils.lerp(
              state.visibilityProgressEased * HANDLE_MAX_OPACITY,
              HANDLE_CLOSE_OPACITY,
              state.closeVisibilityProgressEased,
            );
      const proximityScale = THREE.MathUtils.lerp(
        HANDLE_MIN_SCALE,
        HANDLE_REVEALED_SCALE,
        state.visibilityProgressEased,
      );
      const targetScale = isDragging
        ? HANDLE_DRAG_SCALE
        : isOccluded ? 0.86
          : forceMarkersVisible ? 1
            : THREE.MathUtils.lerp(
              proximityScale,
              HANDLE_CLOSE_SCALE,
              state.closeVisibilityProgressEased,
            );
      state.material.color.setHex(
        isOccluded ? OCCLUDED_MARKER_COLOR : isHovered || isDragging
          ? HOVER_MARKER_COLOR : VISIBLE_MARKER_COLOR,
      );
      state.material.opacity = active ? targetOpacity : 0;
      state.handleScale = THREE.MathUtils.lerp(
        state.handleScale,
        targetScale,
        interpolation,
      );
      state.marker.scale.setScalar(markerScreenScale * state.handleScale);
      state.labelSprite.visible = labelsVisible && (
        isDragging || forceMarkersVisible || state.visibilityProgress > 0 || (isOccluded && showOccludedMarkers)
      );
      state.labelMaterial.color.setHex(isOccluded ? OCCLUDED_MARKER_COLOR : 0xffffff);
      state.labelMaterial.opacity = isHovered || isDragging ? 1 : 0.84;
    }

    canvas.style.cursor = draggingControl ? 'grabbing' : hoveredControl ? 'grab' : '';
    debugHelper.update();
    limitDebugHelper.update();
    if (detailedTimings) analytics.record('handles', performance.now() - timerStart);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;

    pointer.updateFromEvent(event);
    for (const state of controlStates) updateHandlePosition(state);
    updateProximityStates();
    updateOcclusionStates();
    updateEligibilityStates();
    hoveredControl = findNearestControl();
    if (!hoveredControl) return;
    logWeightDiagnostics(hoveredControl.id);

    dragDepthMode = event.shiftKey;
    dragStartClientX = event.clientX;
    dragStartClientY = event.clientY;
    if (!dragDepthMode) {
      camera.getWorldDirection(dragPlaneNormal);
      dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, hoveredControl.worldHandlePosition);
      raycaster.setFromCamera(pointer.ndc, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, dragStartWorld)) return;
      dragStartLocal.copy(dragStartWorld);
      headMesh.worldToLocal(dragStartLocal);
    }
    // Capture the visible procedural contribution before the control becomes
    // drag-active. resolveAppliedOffset intentionally suppresses Wiggle for an
    // active drag, so doing this afterward would always capture zero and could
    // bake the displayed Wiggle displacement into the new held pose.
    resolveAppliedOffset(hoveredControl);
    hoveredControl.dragStartWiggleContribution.copy(hoveredControl.effectiveWiggleOffset);
    hoveredControl.dragStartOffset.copy(hoveredControl.finalAppliedOffset);
    draggingControl = hoveredControl;
    // Drag input has full priority. The oscillator and Wiggle spring continue
    // advancing independently, while only their visible contribution is muted.
    draggingControl.wiggleDragBlend = 0;
    projectOffsetToEllipsoid(draggingControl.dragStartOffset, draggingControl.config.limits);
    draggingControl.hasManualCandidateDiagnostics = false;
    draggingControl.rawCandidateOffset.copy(draggingControl.dragStartOffset);
    draggingControl.dragCandidateOffset.copy(draggingControl.dragStartOffset);
    updateRangeDiagnostics(
      draggingControl,
      draggingControl.rawCandidateOffset,
      draggingControl.dragCandidateOffset,
    );
    draggingControl.currentDragOffset.set(0, 0, 0);
    draggingControl.returnOffset.set(0, 0, 0);
    resetSpringState(draggingControl, true);
    activePointerId = event.pointerId;
    controls.enabled = false;
    onDragStart?.();
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerMove(event) {
    if (!draggingControl) return;

    pointer.updateFromEvent(event);
    if (dragDepthMode) {
      draggingControl.dragPlaneWorldDelta.set(0, 0, 0);
      draggingControl.rawLocalDragDelta.set(
        0,
        0,
        -(event.clientY - dragStartClientY) * DEPTH_DRAG_UNITS_PER_PIXEL,
      );
    } else {
      raycaster.setFromCamera(pointer.ndc, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, dragCurrentWorld)) return;
      dragCurrentLocal.copy(dragCurrentWorld);
      headMesh.worldToLocal(dragCurrentLocal);
      draggingControl.dragPlaneWorldDelta.subVectors(dragCurrentWorld, dragStartWorld);
      draggingControl.rawLocalDragDelta.subVectors(dragCurrentLocal, dragStartLocal);
    }
    draggingControl.pointerDeltaPx.set(
      event.clientX - dragStartClientX,
      event.clientY - dragStartClientY,
    );
    draggingControl.sensitiveLocalDragDelta
      .copy(draggingControl.rawLocalDragDelta)
      .multiply(draggingControl.config.dragSensitivity);
    draggingControl.currentDragOffset.copy(draggingControl.sensitiveLocalDragDelta);
    draggingControl.dragCandidateOffset
      .copy(draggingControl.dragStartOffset)
      .add(draggingControl.currentDragOffset);
    draggingControl.rawCandidateOffset.copy(draggingControl.dragCandidateOffset);
    projectOffsetToEllipsoid(
      draggingControl.dragCandidateOffset,
      draggingControl.config.limits,
    );
    updateRangeDiagnostics(
      draggingControl,
      draggingControl.rawCandidateOffset,
      draggingControl.dragCandidateOffset,
    );
    draggingControl.hasManualCandidateDiagnostics = true;
    draggingControl.currentDragOffset.subVectors(
      draggingControl.dragCandidateOffset,
      draggingControl.dragStartOffset,
    );
  }

  function handlePointerUp(event) {
    if (!draggingControl) return;
    pointer.updateFromEvent(event);
    finishDrag();
    updateProximityStates();
    updateOcclusionStates();
    updateEligibilityStates();
    hoveredControl = findNearestControl();
    canvas.style.cursor = hoveredControl ? 'grab' : '';
  }

  function handlePointerLeave() {
    if (draggingControl) finishDrag();
    hoveredControl = null;
    for (const state of controlStates) {
      state.pointerDistancePx = Infinity;
      state.visibilityProgress = 0;
      state.visibilityProgressEased = 0;
      state.isInsideVisibilityRadius = false;
      state.isInsideGrabRadius = false;
      state.isEligible = false;
    }
    canvas.style.cursor = '';
  }

  function finishDrag() {
    const state = draggingControl;
    resolveAppliedOffset(state);
    state.manualResultOffset
      .copy(state.dragCandidateOffset)
      .sub(state.dragStartWiggleContribution);
    projectOffsetToEllipsoid(state.manualResultOffset, state.config.limits);
    if (mode === 'hold') {
      state.heldOffset.copy(state.manualResultOffset);
      state.returnOffset.set(0, 0, 0);
      resetSpringState(state, true);
    } else {
      state.heldOffset.set(0, 0, 0);
      state.returnOffset.copy(state.manualResultOffset);
      state.hasManualCandidateDiagnostics = false;
      startReleaseSpring(state);
    }
    state.currentDragOffset.set(0, 0, 0);
    state.dragStartWiggleContribution.set(0, 0, 0);
    draggingControl = null;
    dragDepthMode = false;
    releasePointerAndControls();
  }

  function setMode(nextMode) {
    if (nextMode !== 'hold' && nextMode !== 'release') {
      throw new Error(`Unknown deformation mode: ${nextMode}`);
    }
    if (nextMode === mode) return;

    for (const state of controlStates) resolveManualOffset(state);
    const wasDragging = draggingControl !== null;
    if (wasDragging) {
      draggingControl.manualAppliedOffset
        .copy(draggingControl.dragCandidateOffset)
        .sub(draggingControl.dragStartWiggleContribution);
      projectOffsetToEllipsoid(draggingControl.manualAppliedOffset, draggingControl.config.limits);
      draggingControl.dragStartWiggleContribution.set(0, 0, 0);
      draggingControl = null;
      releasePointerAndControls();
    }

    mode = nextMode;
    for (const state of controlStates) {
      state.currentDragOffset.set(0, 0, 0);
      if (mode === 'release') {
        state.heldOffset.set(0, 0, 0);
        state.returnOffset.copy(state.manualAppliedOffset);
        state.hasManualCandidateDiagnostics = false;
        startReleaseSpring(state);
      } else {
        state.heldOffset.copy(state.manualAppliedOffset);
        state.rawCandidateOffset.copy(state.heldOffset);
        projectOffsetToEllipsoid(state.heldOffset, state.config.limits);
        updateRangeDiagnostics(state, state.rawCandidateOffset, state.heldOffset);
        state.hasManualCandidateDiagnostics = true;
        state.returnOffset.set(0, 0, 0);
        resetSpringState(state, true);
      }
      resolveAppliedOffset(state);
      updateHandlePosition(state);
    }
    console.info(`[controls] deformation mode: ${mode}${wasDragging ? ' (drag finished)' : ''}`);
  }

  function releasePointerAndControls() {
    controls.enabled = true;
    onDragEnd?.();
    if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
      canvas.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
  }

  function updateWiggle(delta) {
    if (document.hidden) return;
    // The render loop already protects against a hidden-tab delta. Keep that
    // whole safe delta and integrate it in small steps instead of dropping it.
    const cappedDelta = Math.min(delta, 0.1);
    const globalTarget = wiggleSettings.enabled ? 1 : 0;
    const globalBlendRate = 1 / Math.max(0.01, wiggleSettings.fadeDuration);
    wiggleGlobalBlend += (globalTarget - wiggleGlobalBlend) *
      (1 - Math.exp(-globalBlendRate * cappedDelta));
    const normalizedSpeed = THREE.MathUtils.clamp((wiggleSettings.speed - 0.2) / (30 - 0.2), 0, 1);
    const maxSafePhaseSpeed = Math.min(
      WIGGLE_MAX_PHASE_SPEED,
      WIGGLE_MAX_FREQUENCY_HZ * Math.PI * 2,
    );
    const oscillatorSpeed = 0.2 + (maxSafePhaseSpeed - 0.2) *
      (normalizedSpeed ** WIGGLE_SPEED_CURVE_EXPONENT);
    const speedRatio = Math.max(oscillatorSpeed / WIGGLE_REFERENCE_SPEED, 0.01);
    const stiffnessMultiplier = wiggleSettings.frequencyCompensation
      ? THREE.MathUtils.clamp(
        speedRatio * speedRatio,
        WIGGLE_MIN_STIFFNESS_MULTIPLIER,
        WIGGLE_MAX_STIFFNESS_MULTIPLIER,
      )
      : 1;
    const dampingMultiplier = wiggleSettings.frequencyCompensation
      ? THREE.MathUtils.clamp(
        speedRatio,
        WIGGLE_MIN_DAMPING_MULTIPLIER,
        WIGGLE_MAX_DAMPING_MULTIPLIER,
      )
      : 1;
    const directFollowProgress = THREE.MathUtils.smoothstep(
      wiggleSettings.speed,
      WIGGLE_DIRECT_FOLLOW_START_SPEED,
      WIGGLE_DIRECT_FOLLOW_FULL_SPEED,
    );
    const directFollowBlend = wiggleSettings.frequencyCompensation
      ? directFollowProgress * WIGGLE_MAX_DIRECT_FOLLOW_BLEND
      : 0;
    const effectiveStiffness = wiggleSettings.stiffness * stiffnessMultiplier;
    const effectiveDamping = wiggleSettings.damping * dampingMultiplier;
    if (wiggleSettings.enabled || wiggleGlobalBlend > 0.0001) {
      wiggleTime += cappedDelta * oscillatorSpeed;
    }
    wiggleSettings.globalBlend = wiggleGlobalBlend;
    wiggleSettings.time = wiggleTime;
    wiggleSettings.oscillatorSpeed = oscillatorSpeed;
    wiggleSettings.frequencyHz = oscillatorSpeed / (Math.PI * 2);
    wiggleSettings.speedRatio = speedRatio;
    wiggleSettings.effectiveStiffness = effectiveStiffness;
    wiggleSettings.effectiveDamping = effectiveDamping;
    wiggleSettings.directFollowBlend = directFollowBlend;

    const substepCount = Math.max(1, Math.ceil(cappedDelta / WIGGLE_MAX_SUBSTEP_SECONDS));
    const springStep = cappedDelta / substepCount;
    wiggleSettings.integrationSubsteps = substepCount;
    for (const state of controlStates) {
      const manualOffset = resolveManualOffset(state);
      updateAvailableWiggleRange(state, manualOffset, cappedDelta);
      const controlTarget = state.wiggleEnabled ? 1 : 0;
      state.wiggleControlBlend += (controlTarget - state.wiggleControlBlend) *
        (1 - Math.exp(-cappedDelta / Math.max(0.01, WIGGLE_CONTROL_RESTORE_DURATION)));
      if (state !== draggingControl) {
        state.wiggleDragBlend += (1 - state.wiggleDragBlend) *
          (1 - Math.exp(-cappedDelta / Math.max(0.01, WIGGLE_DRAG_RESUME_SECONDS)));
      }

      const profile = state.config.wiggle;
      const amplitudeScale = wiggleGlobalBlend * state.wiggleControlBlend *
        wiggleSettings.intensity * wiggleSettings.maxRangeFraction;
      state.wiggleEffectiveAmplitude = wiggleGlobalBlend * state.wiggleControlBlend *
        state.wiggleDragBlend * wiggleSettings.intensity;
      state.wiggleDraggingSuppressed = state === draggingControl;
      const waveX = Math.sin(wiggleTime * profile.frequency.x + profile.phase.x);
      const waveY = Math.sin(wiggleTime * profile.frequency.y + profile.phase.y);
      const waveZ = Math.sin(wiggleTime * profile.frequency.z + profile.phase.z);
      const rangeX = waveX >= 0 ? state.wiggleRangePositive.x : state.wiggleRangeNegative.x;
      const rangeY = waveY >= 0 ? state.wiggleRangePositive.y : state.wiggleRangeNegative.y;
      const rangeZ = waveZ >= 0 ? state.wiggleRangePositive.z : state.wiggleRangeNegative.z;
      state.wiggleRawTargetOffset.set(
        waveX * rangeX * profile.amplitude.x * amplitudeScale,
        waveY * rangeY * profile.amplitude.y * amplitudeScale,
        waveZ * rangeZ * profile.amplitude.z * amplitudeScale,
      );
      state.wiggleTargetSafeScale = getSafeWiggleOffset(
        manualOffset,
        state.wiggleRawTargetOffset,
        state.config.limits,
        WIGGLE_BOUNDARY_MARGIN,
        state.wiggleTargetOffset,
        state.wiggleSolverCandidate,
      );

      for (let step = 0; step < substepCount; step += 1) {
        state.wiggleAcceleration
          .subVectors(state.wiggleTargetOffset, state.wiggleOffset)
          .multiplyScalar(effectiveStiffness)
          .addScaledVector(state.wiggleVelocity, -effectiveDamping)
          .multiplyScalar(1 / wiggleSettings.mass);
        state.wiggleVelocity.addScaledVector(state.wiggleAcceleration, springStep);
        state.wiggleOffset.addScaledVector(state.wiggleVelocity, springStep);
      }
      const manualInside = normalizedEllipsoidDistance(manualOffset, state.config.limits) <= 1.000001;
      state.wiggleSpringSafeScale = getSafeWiggleOffset(
        manualOffset,
        state.wiggleOffset,
        state.config.limits,
        WIGGLE_BOUNDARY_MARGIN,
        state.wiggleSafeSpringOffset,
        state.wiggleSolverCandidate,
      );
      if (manualInside && state.wiggleSpringSafeScale < 0.999999) {
        state.wiggleOffset.copy(state.wiggleSafeSpringOffset);
        state.wiggleVelocity.multiplyScalar(state.wiggleSpringSafeScale);
      }
      state.wiggleFinalOffset
        .copy(state.wiggleSafeSpringOffset)
        .multiplyScalar(1 - directFollowBlend)
        .addScaledVector(state.wiggleTargetOffset, directFollowBlend);
      state.wiggleCombinedSafeScale = getSafeWiggleOffset(
        manualOffset,
        state.wiggleFinalOffset,
        state.config.limits,
        WIGGLE_BOUNDARY_MARGIN,
        state.wiggleFinalOffset,
        state.wiggleSolverCandidate,
      );
      state.wiggleBoundaryAttenuated =
        state.wiggleTargetSafeScale < 0.999999 ||
        state.wiggleSpringSafeScale < 0.999999 ||
        state.wiggleCombinedSafeScale < 0.999999;
      state.wiggleTargetMagnitude = state.wiggleTargetOffset.length();
      state.wiggleSpringMagnitude = state.wiggleOffset.length();
      state.wigglePeakTargetMagnitude = Math.max(state.wigglePeakTargetMagnitude, state.wiggleTargetMagnitude);
      state.wigglePeakSpringMagnitude = Math.max(state.wigglePeakSpringMagnitude, state.wiggleSpringMagnitude);

      if (
        !wiggleSettings.enabled && wiggleGlobalBlend < 0.0001 &&
        state.wiggleOffset.lengthSq() < 1e-8 && state.wiggleVelocity.lengthSq() < 1e-8
      ) {
        state.wiggleTargetOffset.set(0, 0, 0);
        state.wiggleOffset.set(0, 0, 0);
        state.wiggleFinalOffset.set(0, 0, 0);
        state.wiggleVelocity.set(0, 0, 0);
      }
    }
  }

  function updateAvailableWiggleRange(state, manualOffset, delta) {
    const limits = state.config.limits;
    state.wiggleManualOffset.copy(manualOffset);
    state.wiggleRemainingPositive.set(
      Math.max(0, limits.maxX - manualOffset.x),
      Math.max(0, limits.maxY - manualOffset.y),
      Math.max(0, limits.maxZ - manualOffset.z),
    );
    state.wiggleRemainingNegative.set(
      Math.max(0, manualOffset.x - limits.minX),
      Math.max(0, manualOffset.y - limits.minY),
      Math.max(0, manualOffset.z - limits.minZ),
    );
    const usableFraction = 1 - THREE.MathUtils.clamp(WIGGLE_BOUNDARY_MARGIN, 0, 0.5);
    state.wiggleRangeTargetPositive
      .copy(state.wiggleRemainingPositive)
      .multiplyScalar(usableFraction);
    state.wiggleRangeTargetNegative
      .copy(state.wiggleRemainingNegative)
      .multiplyScalar(usableFraction);

    if (!state.wiggleRangeInitialized) {
      state.wiggleRangePositive.copy(state.wiggleRangeTargetPositive);
      state.wiggleRangeNegative.copy(state.wiggleRangeTargetNegative);
      state.wiggleRangeInitialized = true;
      return;
    }
    // Hold the previous envelope while the pointer owns this control. The new
    // remaining range starts adapting only after release, independently for
    // each control, while the procedural phase and spring keep advancing.
    if (state === draggingControl) return;
    const blend = 1 - Math.exp(
      -delta / Math.max(0.01, WIGGLE_RANGE_ADAPT_SECONDS),
    );
    state.wiggleRangePositive.lerp(state.wiggleRangeTargetPositive, blend);
    state.wiggleRangeNegative.lerp(state.wiggleRangeTargetNegative, blend);
  }

  function updateSpring(state, delta) {
    if (
      state === draggingControl ||
      mode !== 'release' ||
      state.springSettled
    ) {
      return;
    }

    const cappedDelta = Math.min(delta, RELEASE_MAX_DELTA_TIME);
    const substepCount = Math.max(1, Math.ceil(cappedDelta / (1 / 120)));
    const springStep = cappedDelta / substepCount;
    for (let step = 0; step < substepCount; step += 1) {
      state.springAcceleration
        .copy(state.returnOffset)
        .multiplyScalar(-springSettings.stiffness)
        .addScaledVector(state.springVelocity, -springSettings.damping)
        .multiplyScalar(1 / springSettings.mass);
      state.springVelocity.addScaledVector(state.springAcceleration, springStep);
      state.returnOffset.addScaledVector(state.springVelocity, springStep);
      constrainSpringOvershoot(state);
      updateSpringDiagnostics(state);
    }

    const velocitySettleThreshold = springSettings.settleEpsilon *
      Math.sqrt(springSettings.stiffness / springSettings.mass);
    if (
      state.returnOffset.lengthSq() < springSettings.settleEpsilon ** 2 &&
      state.springVelocity.lengthSq() < velocitySettleThreshold ** 2
    ) {
      state.returnOffset.set(0, 0, 0);
      settleSpringState(state);
    }
  }

  function updateKeyboardPulse(state, delta) {
    if (state.keyboardPhase === 'idle') return;
    const cappedDelta = Math.min(delta, RELEASE_MAX_DELTA_TIME);

    if (state.keyboardPhase === 'attack') {
      state.keyboardOffset.lerp(
        state.keyboardTarget,
        1 - Math.exp(-keyboardSettings.attackSpeed * cappedDelta),
      );
      state.keyboardAttackRemaining -= cappedDelta;
      if (state.keyboardAttackRemaining > 0) return;
      state.keyboardOffset.copy(state.keyboardTarget);
      if (state.keyboardKeyHeld) {
        state.keyboardVelocity.set(0, 0, 0);
        state.keyboardPhase = 'held';
        return;
      }
      beginKeyboardRelease(state);
    }

    if (state.keyboardPhase === 'held') {
      state.keyboardOffset.copy(state.keyboardTarget);
      state.keyboardVelocity.set(0, 0, 0);
      return;
    }

    const substeps = Math.max(1, Math.ceil(cappedDelta / (1 / 120)));
    const step = cappedDelta / substeps;
    for (let index = 0; index < substeps; index += 1) {
      state.keyboardAcceleration
        .copy(state.keyboardOffset)
        .multiplyScalar(-keyboardSettings.springStiffness)
        .addScaledVector(state.keyboardVelocity, -keyboardSettings.springDamping)
        .multiplyScalar(1 / keyboardSettings.springMass);
      state.keyboardVelocity.addScaledVector(state.keyboardAcceleration, step);
      state.keyboardOffset.addScaledVector(state.keyboardVelocity, step);
      constrainKeyboardOvershoot(state);
    }

    const velocityEpsilon = keyboardSettings.settleEpsilon *
      Math.sqrt(keyboardSettings.springStiffness / keyboardSettings.springMass);
    if (
      state.keyboardOffset.lengthSq() < keyboardSettings.settleEpsilon ** 2 &&
      state.keyboardVelocity.lengthSq() < velocityEpsilon ** 2
    ) {
      state.keyboardOffset.set(0, 0, 0);
      state.keyboardVelocity.set(0, 0, 0);
      state.keyboardPhase = 'idle';
    }
  }

  function constrainKeyboardOvershoot(state) {
    if (state.keyboardStartingMagnitude === 0) return;
    const projection = state.keyboardOffset.dot(state.keyboardReleaseDirection);
    const oppositeLimit = -state.keyboardStartingMagnitude * keyboardSettings.maxOvershootMultiplier;
    if (projection >= oppositeLimit) return;
    state.keyboardOffset.addScaledVector(
      state.keyboardReleaseDirection,
      oppositeLimit - projection,
    );
    const outwardVelocity = state.keyboardVelocity.dot(state.keyboardReleaseDirection);
    if (outwardVelocity < 0) {
      state.keyboardVelocity.addScaledVector(state.keyboardReleaseDirection, -outwardVelocity);
    }
  }

  function beginKeyboardRelease(state) {
    const magnitude = state.keyboardOffset.length();
    state.keyboardKeyHeld = false;
    state.keyboardStartingMagnitude = magnitude;
    if (magnitude <= keyboardSettings.settleEpsilon) {
      state.keyboardOffset.set(0, 0, 0);
      state.keyboardVelocity.set(0, 0, 0);
      state.keyboardPhase = 'idle';
      return;
    }
    state.keyboardReleaseDirection.copy(state.keyboardOffset).multiplyScalar(1 / magnitude);
    state.keyboardVelocity.copy(state.keyboardOffset).multiplyScalar(-keyboardSettings.springImpulse);
    state.keyboardPhase = 'release';
  }

  function triggerKeyboardPulse(controlId) {
    const state = controlStates.find((control) => control.id === controlId && control.active);
    if (!state) return false;

    // The pulse starts from the control's current resting deformation, then
    // finds the exact remaining distance to its keyboard-scaled ellipsoid.
    resolveManualOffset(state);
    updateKeyboardLimits(state);
    state.keyboardRandomDirection.set(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    );
    if (state.keyboardRandomDirection.lengthSq() < 0.0001) {
      state.keyboardRandomDirection.set(0, 1, 0);
    } else {
      state.keyboardRandomDirection.normalize();
    }
    // Feed the solver a vector guaranteed to extend beyond the largest axis.
    // It returns the exact remaining ellipsoid segment, not a radius fallback.
    state.keyboardRandomDirection.multiplyScalar(
      state.config.maxDisplacement * keyboardDistortionMultiplier * 2,
    );
    const availableScale = getSafeWiggleOffset(
      state.manualAppliedOffset,
      state.keyboardRandomDirection,
      state.keyboardLimits,
      0,
      state.keyboardTarget,
      state.keyboardSolverCandidate,
    );
    if (availableScale <= 0.0001) return false;

    // Preserve the current visible pulse on key-repeat; the new attack retargets
    // immediately instead of snapping back or queuing an old bounce.
    state.keyboardVelocity.set(0, 0, 0);
    state.keyboardAttackRemaining = keyboardSettings.attackDurationSeconds;
    state.keyboardKeyHeld = true;
    state.keyboardPhase = 'attack';
    return true;
  }

  function releaseKeyboardPulse(controlId) {
    const state = controlStates.find((control) => control.id === controlId && control.active);
    if (!state) return false;
    state.keyboardKeyHeld = false;
    // A short tap still completes its fast attack to maximum before releasing.
    if (state.keyboardPhase === 'attack') return true;
    if (state.keyboardPhase === 'held') beginKeyboardRelease(state);
    return state.keyboardPhase !== 'idle';
  }

  function updateKeyboardLimits(state) {
    const source = state.config.limits;
    const target = state.keyboardLimits;
    target.minX = source.minX * keyboardDistortionMultiplier;
    target.maxX = source.maxX * keyboardDistortionMultiplier;
    target.minY = source.minY * keyboardDistortionMultiplier;
    target.maxY = source.maxY * keyboardDistortionMultiplier;
    target.minZ = source.minZ * keyboardDistortionMultiplier;
    target.maxZ = source.maxZ * keyboardDistortionMultiplier;
  }

  function startReleaseSpring(state) {
    const releasedMagnitude = state.returnOffset.length();
    resetSpringState(state, releasedMagnitude === 0);
    state.releasedStartingMagnitude = releasedMagnitude;
    if (releasedMagnitude === 0) return;
    state.releaseDirection.copy(state.returnOffset).multiplyScalar(1 / releasedMagnitude);
    state.previousSpringProjection = releasedMagnitude;
    state.springVelocity.copy(state.returnOffset).multiplyScalar(-springSettings.impulse);
    state.springSettled = false;
  }

  function resetSpringState(state, settled) {
    state.springVelocity.set(0, 0, 0);
    state.springAcceleration.set(0, 0, 0);
    state.releasedStartingMagnitude = settled ? 0 : state.releasedStartingMagnitude;
    state.firstOvershootRatio = 0;
    state.currentOvershootRatio = 0;
    state.oscillationCount = 0;
    state.previousSpringProjection = 0;
    state.springSettled = settled;
  }

  function settleSpringState(state) {
    state.springVelocity.set(0, 0, 0);
    state.springAcceleration.set(0, 0, 0);
    state.currentOvershootRatio = 0;
    state.springSettled = true;
  }

  function constrainSpringOvershoot(state) {
    if (state.releasedStartingMagnitude === 0) return;
    const projection = state.returnOffset.dot(state.releaseDirection);
    const oppositeLimit = -state.releasedStartingMagnitude * springSettings.maxOvershootMultiplier;
    if (projection >= oppositeLimit) return;
    state.returnOffset.addScaledVector(state.releaseDirection, oppositeLimit - projection);
    const outwardVelocity = state.springVelocity.dot(state.releaseDirection);
    if (outwardVelocity < 0) state.springVelocity.addScaledVector(state.releaseDirection, -outwardVelocity);
  }

  function updateSpringDiagnostics(state) {
    if (state.releasedStartingMagnitude === 0) return;
    const projection = state.returnOffset.dot(state.releaseDirection);
    if (state.previousSpringProjection * projection < 0) state.oscillationCount += 1;
    state.currentOvershootRatio = Math.max(0, -projection / state.releasedStartingMagnitude);
    if (state.oscillationCount === 1) {
      state.firstOvershootRatio = Math.max(state.firstOvershootRatio, state.currentOvershootRatio);
    }
    state.previousSpringProjection = projection;
  }

  function resolveManualOffset(state) {
    if (state === draggingControl) {
      state.manualAppliedOffset.copy(state.dragCandidateOffset);
    } else if (mode === 'hold') {
      state.manualAppliedOffset.copy(state.heldOffset);
      if (!state.hasManualCandidateDiagnostics) {
        updateRangeDiagnostics(state, state.heldOffset, state.manualAppliedOffset);
      }
    } else {
      state.manualAppliedOffset.copy(state.returnOffset);
      // Release motion intentionally remains outside the manual ellipsoid so
      // its underdamped neutral crossing and opposite-side overshoot survive.
      updateRangeDiagnostics(state, state.returnOffset, state.manualAppliedOffset);
    }
    return state.manualAppliedOffset;
  }

  function resolveAppliedOffset(state) {
    resolveManualOffset(state);
    state.finalAppliedOffset.copy(state.manualAppliedOffset);
    state.effectiveWiggleOffset.set(0, 0, 0);

    if (state.keyboardPhase !== 'idle') {
      updateKeyboardLimits(state);
      getSafeWiggleOffset(
        state.manualAppliedOffset,
        state.keyboardOffset,
        state.keyboardLimits,
        0,
        state.keyboardSafeOffset,
        state.keyboardSolverCandidate,
      );
      state.finalAppliedOffset.add(state.keyboardSafeOffset);
    } else {
      state.keyboardSafeOffset.set(0, 0, 0);
    }

    state.faceHoverSafeOffset.set(0, 0, 0);
    if (state.faceHoverDesiredOffset.lengthSq() > 0) {
      getSafeWiggleOffset(
        state.finalAppliedOffset,
        state.faceHoverDesiredOffset,
        state.config.limits,
        0,
        state.faceHoverSafeOffset,
        state.faceHoverSolverCandidate,
      );
      state.finalAppliedOffset.add(state.faceHoverSafeOffset);
    }

    // A grabbed control remains exactly under the pointer. Its visual Wiggle
    // baseline is removed from the stored manual result when the drag ends.
    if (state === draggingControl) return state.finalAppliedOffset;

    if (
      state.wiggleDragBlend <= 0.0001 ||
      state.wiggleFinalOffset.lengthSq() === 0
    ) {
      return state.finalAppliedOffset;
    }
    state.wiggleVisibleDesiredOffset
      .copy(state.wiggleFinalOffset)
      .multiplyScalar(state.wiggleDragBlend);
    state.wiggleFinalGuardScale = getSafeWiggleOffset(
      state.finalAppliedOffset,
      state.wiggleVisibleDesiredOffset,
      state.config.limits,
      0,
      state.effectiveWiggleOffset,
      state.wiggleSolverCandidate,
    );
    state.wiggleFinalGuardReached = state.wiggleFinalGuardScale < 0.999999;
    state.finalAppliedOffset.add(state.effectiveWiggleOffset);
    return state.finalAppliedOffset;
  }

  function updateHandlePosition(state) {
    state.localHandlePosition
      .copy(state.center)
      .addScaledVector(state.finalAppliedOffset, state.config.strength);
    state.worldHandlePosition.copy(state.localHandlePosition);
    headMesh.localToWorld(state.worldHandlePosition);
    state.marker.position.copy(state.localHandlePosition);
    state.labelSprite.position.copy(state.localHandlePosition);
    state.labelSprite.position.y += LABEL_LOCAL_Y_OFFSET;
  }

  function updateOcclusionStates() {
    occlusionRaysThisFrame = 0;
    camera.getWorldPosition(cameraWorldPosition);
    for (const state of controlStates) {
      if (!state.active) {
        state.occluded = true;
        continue;
      }
      if (state === draggingControl) {
        state.occluded = false;
        continue;
      }

      // Normal handle visibility is proximity-driven. When the handle cannot
      // contribute any opacity or interaction, its head raycast cannot affect
      // the rendered or interactive result and is safely skipped. Debug modes
      // that intentionally expose all markers still receive exact occlusion.
      const needsOcclusion = state.isInsideVisibilityRadius ||
        forceMarkersVisible || showOccludedMarkers;
      if (!needsOcclusion) {
        state.occluded = false;
        state.occlusionHandleDistance = Infinity;
        state.occlusionFirstHitDistance = Infinity;
        continue;
      }

      occlusionDirection.subVectors(state.worldHandlePosition, cameraWorldPosition);
      const handleDistance = occlusionDirection.length();
      if (handleDistance <= OCCLUSION_EPSILON) {
        state.occluded = false;
        continue;
      }
      occlusionDirection.multiplyScalar(1 / handleDistance);
      occlusionRaycaster.set(cameraWorldPosition, occlusionDirection);
      occlusionRaycaster.near = 0;
      occlusionRaycaster.far = handleDistance + OCCLUSION_EPSILON;
      occlusionIntersections.length = 0;
      occlusionRaysThisFrame += 1;
      occlusionRaycaster.intersectObject(headMesh, false, occlusionIntersections);
      const firstHitDistance = occlusionIntersections[0]?.distance ?? Infinity;
      state.occlusionHandleDistance = handleDistance;
      state.occlusionFirstHitDistance = firstHitDistance;
      state.occluded = firstHitDistance < handleDistance - OCCLUSION_EPSILON;
    }
  }

  function updateProximityStates() {
    const bounds = canvas.getBoundingClientRect();
    handlesInsideVisibilityRadius = 0;
    for (const state of controlStates) {
      state.grabRadiusPx = state.config.grabRadiusPx;
      state.visibilityRadiusPx = Math.max(state.config.visibilityRadiusPx, state.grabRadiusPx);
      if (!state.active || !pointer.inside) {
        state.pointerDistancePx = Infinity;
        state.visibilityProgress = 0;
        state.visibilityProgressEased = 0;
        state.closeVisibilityProgress = 0;
        state.closeVisibilityProgressEased = 0;
        state.isInsideVisibilityRadius = false;
        state.isInsideGrabRadius = false;
        state.isEligible = false;
        continue;
      }

      state.projectedPosition.copy(state.worldHandlePosition).project(camera);
      if (state.projectedPosition.z < -1 || state.projectedPosition.z > 1) {
        state.pointerDistancePx = Infinity;
        state.visibilityProgress = 0;
        state.visibilityProgressEased = 0;
        state.closeVisibilityProgress = 0;
        state.closeVisibilityProgressEased = 0;
        state.isInsideVisibilityRadius = false;
        state.isInsideGrabRadius = false;
        state.isEligible = false;
        continue;
      }

      const screenX = bounds.left + (state.projectedPosition.x * 0.5 + 0.5) * bounds.width;
      const screenY = bounds.top + (-state.projectedPosition.y * 0.5 + 0.5) * bounds.height;
      const dx = pointer.client.x - screenX;
      const dy = pointer.client.y - screenY;
      state.pointerDistancePx = Math.hypot(dx, dy);
      const fadeSpan = Math.max(0.0001, state.visibilityRadiusPx - state.grabRadiusPx);
      state.visibilityProgress = THREE.MathUtils.clamp(
        1 - (state.pointerDistancePx - state.grabRadiusPx) / fadeSpan,
        0,
        1,
      );
      state.visibilityProgressEased = state.visibilityProgress * state.visibilityProgress *
        (3 - 2 * state.visibilityProgress);
      const closeVisibilityRadius = state.grabRadiusPx *
        HANDLE_CLOSE_VISIBILITY_RADIUS_RATIO;
      state.closeVisibilityProgress = THREE.MathUtils.clamp(
        1 - state.pointerDistancePx / Math.max(closeVisibilityRadius, 0.0001),
        0,
        1,
      );
      state.closeVisibilityProgressEased = state.closeVisibilityProgress *
        state.closeVisibilityProgress * (3 - 2 * state.closeVisibilityProgress);
      state.isInsideVisibilityRadius = state.pointerDistancePx < state.visibilityRadiusPx;
      if (state.isInsideVisibilityRadius) handlesInsideVisibilityRadius += 1;
      state.isInsideGrabRadius = state.pointerDistancePx < state.grabRadiusPx;
      // Occlusion is resolved after this cheap screen-space candidate pass.
      state.isEligible = false;
    }
  }

  function updateEligibilityStates() {
    for (const state of controlStates) {
      state.isEligible = state.active && state.isInsideGrabRadius && !state.occluded;
    }
  }

  function findNearestControl() {
    if (!pointer.inside) return null;

    let nearest = null;
    let nearestDistance = Infinity;
    for (const state of controlStates) {
      if (!state.isEligible) continue;
      if (state.pointerDistancePx < nearestDistance) {
        nearest = state;
        nearestDistance = state.pointerDistancePx;
      }
    }
    return nearest;
  }

  const debugState = {
    get mode() {
      return mode;
    },
    controls: controlStates,
  };

  function setEyeHoverFaceReaction(leftAmount, rightAmount) {
    if (!SQUINTING_CONFIG.enabled) {
      for (const controlId of EYE_HOVER_FACE_CONTROL_IDS) {
        controlStatesById.get(controlId)?.faceHoverDesiredOffset.set(0, 0, 0);
      }
      return;
    }
    const left = THREE.MathUtils.clamp(leftAmount ?? 0, 0, 1);
    const right = THREE.MathUtils.clamp(rightAmount ?? 0, 0, 1);
    const leftStrengths = getFaceHoverStrengths(left);
    const rightStrengths = getFaceHoverStrengths(right);
    // The imported half-close eye names are mirrored relative to the
    // authored facial-control sides, so route this secondary expression to
    // the opposite control set while leaving eyelid morph mapping untouched.
    setFaceHoverControlOffset('mouthLeft', 0, rightStrengths.mouthUp, 0);
    setFaceHoverControlOffset('mouthRight', 0, leftStrengths.mouthUp, 0);
    setFaceHoverControlOffset(
      'cheekLeft', 0, rightStrengths.cheekUp, rightStrengths.cheekForward,
    );
    setFaceHoverControlOffset(
      'cheekRight', 0, leftStrengths.cheekUp, leftStrengths.cheekForward,
    );
    setFaceHoverControlOffset(
      'eyebrowLeft', 0, -rightStrengths.eyebrowDown, rightStrengths.eyebrowForward,
    );
    setFaceHoverControlOffset(
      'eyebrowRight', 0, -leftStrengths.eyebrowDown, leftStrengths.eyebrowForward,
    );
  }

  function getFaceHoverStrengths(amount) {
    return {
      mouthUp: getRangedSquintStrength(
        amount, SQUINTING_CONFIG.mouthUpMin, SQUINTING_CONFIG.mouthUpMax,
      ),
      cheekUp: getRangedSquintStrength(
        amount, SQUINTING_CONFIG.cheekUpMin, SQUINTING_CONFIG.cheekUpMax,
      ),
      cheekForward: getRangedSquintStrength(
        amount, SQUINTING_CONFIG.cheekForwardMin, SQUINTING_CONFIG.cheekForwardMax,
      ),
      eyebrowDown: getRangedSquintStrength(
        amount, SQUINTING_CONFIG.eyebrowDownMin, SQUINTING_CONFIG.eyebrowDownMax,
      ),
      eyebrowForward: getRangedSquintStrength(
        amount, SQUINTING_CONFIG.eyebrowForwardMin, SQUINTING_CONFIG.eyebrowForwardMax,
      ),
    };
  }

  function setFaceHoverControlOffset(controlId, xFactor, yFactor, zFactor) {
    const state = controlStatesById.get(controlId);
    if (!state?.active) return;
    const limits = state.config.limits;
    state.faceHoverDesiredOffset.set(
      directionalLimitForFactor(xFactor, limits.minX, limits.maxX),
      directionalLimitForFactor(yFactor, limits.minY, limits.maxY),
      directionalLimitForFactor(zFactor, limits.minZ, limits.maxZ),
    );
  }

  function logWeightDiagnostics(controlId) {
    const state = controlStates.find((control) => control.id === controlId);
    if (!state) return;
    console.info(`[weights] ${state.id}`, {
      source: state.influence.source,
      attribute: state.influence.attributeName,
      channel: state.influence.channel ?? null,
      minimumNonZeroImportedWeight: state.influence.minImportedWeight,
      maximumImportedWeight: state.influence.maxImportedWeight,
      ranges: state.influence.histogram,
      lipValidation: state.influence.lipValidation,
      duplicateWeightMismatches: state.influence.duplicateWeightMismatches,
      affectedVertexWeights: Array.from(state.influence.indices, (vertexIndex, index) => ({
        vertexIndex,
        weight: state.influence.weights[index],
      })),
      remapValidation: state.influence.remapValidation,
      strictMode: USE_STRICT_AUTHORED_MASKS,
      effectiveSettings: {
        WEIGHT_REMAP_MODE,
        WEIGHT_GAMMA,
        WEIGHT_GAIN,
        WEIGHT_EPSILON,
      },
      representativeWeightMapping: getRepresentativeWeightMapping(),
    });
  }

  return {
    markers: controlStates.map((state) => state.marker),
    update,
    setMode,
    setEyeHoverFaceReaction,
    isInteractionCursorReserved() {
      return Boolean(draggingControl || hoveredControl);
    },
    resetInteractionState() {
      if (draggingControl) {
        draggingControl = null;
        dragDepthMode = false;
        releasePointerAndControls();
      }
      for (const state of controlStates) {
        state.heldOffset.set(0, 0, 0);
        state.currentDragOffset.set(0, 0, 0);
        state.returnOffset.set(0, 0, 0);
        state.keyboardOffset.set(0, 0, 0);
        state.keyboardVelocity.set(0, 0, 0);
        state.keyboardKeyHeld = false;
        state.keyboardPhase = 'idle';
        state.faceHoverDesiredOffset.set(0, 0, 0);
        state.faceHoverSafeOffset.set(0, 0, 0);
        state.dragStartOffset.set(0, 0, 0);
        state.dragCandidateOffset.set(0, 0, 0);
        state.finalAppliedOffset.set(0, 0, 0);
        state.hasManualCandidateDiagnostics = false;
        resetSpringState(state, true);
        updateRangeDiagnostics(state, state.finalAppliedOffset, state.finalAppliedOffset);
        updateHandlePosition(state);
      }
      hoveredControl = null;
      canvas.style.cursor = '';
    },
    setDebugVisible: debugHelper.setVisible,
    setPickAnchorsVisible: debugHelper.setAnchorsVisible,
    setAffectedVerticesVisible: debugHelper.setAffectedVerticesVisible,
    setSelectedDebugControl: debugHelper.setSelectedControl,
    setDebugWeightView: debugHelper.setWeightView,
    logWeightDiagnostics,
    setAllMarkersVisible(value) {
      forceMarkersVisible = value;
    },
    setPickLabelsVisible(value) {
      labelsVisible = value;
    },
    setShowOccludedMarkers(value) {
      showOccludedMarkers = value;
    },
    getAllControlLimits() {
      return Object.fromEntries(controlStates.map((state) => [
        state.id,
        { ...state.config.limits },
      ]));
    },
    setControlLimits(controlId, nextLimits) {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return false;
      assignValidatedLimits(state.config.limits, nextLimits);
      if (state === draggingControl) {
        projectOffsetToEllipsoid(state.dragStartOffset, state.config.limits);
        state.dragCandidateOffset.copy(state.rawCandidateOffset);
        projectOffsetToEllipsoid(state.dragCandidateOffset, state.config.limits);
        updateRangeDiagnostics(state, state.rawCandidateOffset, state.dragCandidateOffset);
        state.hasManualCandidateDiagnostics = true;
        state.currentDragOffset.subVectors(state.dragCandidateOffset, state.dragStartOffset);
      } else if (mode === 'hold') {
        // Reduced live limits immediately project a held pose onto the nearest
        // radial boundary, preserving its direction and avoiding stale poses.
        state.rawCandidateOffset.copy(state.heldOffset);
        projectOffsetToEllipsoid(state.heldOffset, state.config.limits);
        updateRangeDiagnostics(state, state.rawCandidateOffset, state.heldOffset);
        state.hasManualCandidateDiagnostics = true;
      }
      resolveAppliedOffset(state);
      updateHandlePosition(state);
      limitDebugHelper.refresh(state.id);
      return true;
    },
    getControlDragSensitivity(controlId) {
      const state = controlStates.find((control) => control.id === controlId);
      return state ? state.config.dragSensitivity.toArray() : null;
    },
    setControlDragSensitivity(controlId, values) {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return false;
      const sensitivity = state.config.dragSensitivity;
      sensitivity.set(
        Number.isFinite(values.x) ? Math.max(0, values.x) : sensitivity.x,
        Number.isFinite(values.y) ? Math.max(0, values.y) : sensitivity.y,
        Number.isFinite(values.z) ? Math.max(0, values.z) : sensitivity.z,
      );
      return true;
    },
    getControlHandleProximity(controlId) {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return null;
      return {
        visibilityRadiusPx: state.config.visibilityRadiusPx,
        grabRadiusPx: state.config.grabRadiusPx,
        visibilityMultiplier: state.config.visibilityRadiusPx / state.config.grabRadiusPx,
      };
    },
    setControlHandleProximity(controlId, values) {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return false;
      if (Number.isFinite(values.grabRadiusPx)) {
        state.config.grabRadiusPx = Math.max(1, values.grabRadiusPx);
      }
      if (Number.isFinite(values.visibilityRadiusPx)) {
        state.config.visibilityRadiusPx = Math.max(
          state.config.grabRadiusPx,
          values.visibilityRadiusPx,
        );
      }
      return true;
    },
    getHandleVisibilityRadiusMultiplier() {
      return handleVisibilityRadiusMultiplier;
    },
    setHandleVisibilityRadiusMultiplier(value) {
      if (!Number.isFinite(value)) return false;
      handleVisibilityRadiusMultiplier = Math.max(1, value);
      for (const state of controlStates) {
        state.config.visibilityRadiusPx =
          state.config.grabRadiusPx * handleVisibilityRadiusMultiplier;
      }
      return true;
    },
    getControlRangeState(controlId) {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return null;
      const limits = state.config.limits;
      const tolerance = 0.0001;
      return {
        offset: state.finalAppliedOffset.toArray(),
        rawCandidateOffset: state.rawCandidateOffset.toArray(),
        clampedOffset: state.clampedCandidateOffset.toArray(),
        normalizedDistance: state.normalizedEllipsoidDistance,
        clampedNormalizedDistance: state.clampedNormalizedEllipsoidDistance,
        inside: state.candidateInsideEllipsoid,
        atBoundary: Math.abs(state.clampedNormalizedEllipsoidDistance - 1) <= tolerance,
        activeRadii: state.activeDirectionalRadii.toArray(),
        dragSensitivity: state.config.dragSensitivity.toArray(),
        dragging: state === draggingControl,
        pointerDeltaPx: state.pointerDeltaPx.toArray(),
        dragPlaneWorldDelta: state.dragPlaneWorldDelta.toArray(),
        rawLocalDragDelta: state.rawLocalDragDelta.toArray(),
        sensitiveLocalDragDelta: state.sensitiveLocalDragDelta.toArray(),
        limits: { ...limits },
      };
    },
    setLimitDebugVisible(value) {
      limitDebugHelper.setVisible(value);
    },
    setLimitDebugControl(controlId) {
      limitDebugHelper.setSelectedControl(controlId);
    },
    setSpringSettings(values) {
      Object.assign(springSettings, values);
    },
    getSpringSettings() {
      return { ...springSettings };
    },
    getSpringDebugState(controlId = 'nose') {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return null;
      return {
        offsetMagnitude: state.finalAppliedOffset.length(),
        velocityMagnitude: state.springVelocity.length(),
        releasedStartingMagnitude: state.releasedStartingMagnitude,
        currentOvershootRatio: state.currentOvershootRatio,
        firstOvershootRatio: state.firstOvershootRatio,
        oscillationCount: state.oscillationCount,
        settled: state.springSettled,
      };
    },
    setWiggleEnabled(value) {
      wiggleSettings.enabled = Boolean(value);
    },
    setWiggleSettings(values) {
      if (Number.isFinite(values.speed)) {
        wiggleSettings.speed = THREE.MathUtils.clamp(values.speed, 0.2, 30);
      }
      if (Number.isFinite(values.intensity)) {
        wiggleSettings.intensity = THREE.MathUtils.clamp(values.intensity, 0, 2);
      }
      if (typeof values.frequencyCompensation === 'boolean') {
        wiggleSettings.frequencyCompensation = values.frequencyCompensation;
      }
      if (Number.isFinite(values.stiffness)) wiggleSettings.stiffness = Math.max(1, values.stiffness);
      if (Number.isFinite(values.damping)) wiggleSettings.damping = Math.max(0, values.damping);
      if (Number.isFinite(values.mass)) wiggleSettings.mass = Math.max(0.05, values.mass);
      if (Number.isFinite(values.fadeDuration)) {
        wiggleSettings.fadeDuration = THREE.MathUtils.clamp(values.fadeDuration, 0.05, 2);
      }
      if (Number.isFinite(values.maxRangeFraction)) {
        wiggleSettings.maxRangeFraction = THREE.MathUtils.clamp(values.maxRangeFraction, 0.05, 0.75);
      }
    },
    getWiggleSettings() {
      return wiggleSettings;
    },
    setWiggleControlEnabled(controlId, value) {
      const state = controlStates.find((control) => control.id === controlId);
      if (!state) return false;
      state.wiggleEnabled = Boolean(value);
      return true;
    },
    setAllWiggleControlsEnabled(value) {
      for (const state of controlStates) state.wiggleEnabled = Boolean(value);
    },
    getWiggleDebugState(controlId = 'nose') {
      const state = controlStates.find((control) => control.id === controlId);
      return state ?? null;
    },
    getPerformanceStats() {
      let activeWiggleControls = 0;
      let activeManualControls = 0;
      for (const state of controlStates) {
        if (
          wiggleGlobalBlend > 0.0001 &&
          state.wiggleEnabled &&
          state.wiggleControlBlend > 0.0001
        ) {
          activeWiggleControls += 1;
        }
        if (state.heldOffset.lengthSq() > 1e-8 || state.returnOffset.lengthSq() > 1e-8) {
          activeManualControls += 1;
        }
      }
      return {
        totalControls: controlStates.length,
        activeWiggleControls,
        activeManualControls,
        handlesInsideVisibilityRadius,
        occlusionRaysThisFrame,
        forceMarkersVisible,
      };
    },
    testAllWiggle() {
      for (const state of controlStates) state.wiggleEnabled = true;
      wiggleSettings.intensity = 0.45;
      wiggleSettings.enabled = true;
    },
    testMaxRelease(controlId = 'nose') {
      const state = controlStates.find((control) => control.id === controlId && control.active);
      if (!state) return false;
      mode = 'release';
      state.heldOffset.set(0, 0, 0);
      state.returnOffset.set(0, 0, state.config.maxDisplacement);
      startReleaseSpring(state);
      resolveAppliedOffset(state);
      return true;
    },
    triggerKeyboardPulse,
    triggerKeyboardPulseByPickName(pickName) {
      const state = controlStates.find((control) => control.config.pickName === pickName);
      return state ? triggerKeyboardPulse(state.id) : false;
    },
    releaseKeyboardPulseByPickName(pickName) {
      const state = controlStates.find((control) => control.config.pickName === pickName);
      return state ? releaseKeyboardPulse(state.id) : false;
    },
    setKeyboardDistortionMultiplier(value) {
      if (!Number.isFinite(value)) return false;
      keyboardDistortionMultiplier = THREE.MathUtils.clamp(
        value,
        keyboardSettings.distortionMultiplierMin,
        keyboardSettings.distortionMultiplierMax,
      );
      return true;
    },
    getKeyboardDistortionMultiplier() {
      return keyboardDistortionMultiplier;
    },
    debugState,
    controls: controlStates,
    isIndexed: deformer.isIndexed,
    usesFallbackMasks: false,
    hasMissingAuthoredMasks: controlStates.some((state) => state.influence.source === 'missing-strict'),
    missingAuthoredMasks: controlStates
      .filter((state) => state.influence.source === 'missing-strict')
      .map((state) => state.config.maskName),
  };
}

function createControlState(config, deformer, markerTexture, model) {
  const anchor = model.getObjectByName(config.pickName);
  const center = new THREE.Vector3();
  const anchorWorldPosition = new THREE.Vector3();
  if (anchor) {
    anchor.getWorldPosition(anchorWorldPosition);
    center.copy(anchorWorldPosition);
    deformer.mesh.worldToLocal(center);
  } else {
    console.warn(`[controls] Missing ${config.pickName}; using the origin as a temporary handle position.`);
  }
  const material = new THREE.SpriteMaterial({
    map: markerTexture,
    color: config.handleColor,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const marker = new THREE.Sprite(material);
  const { sprite: labelSprite, material: labelMaterial } = createLabelSprite(
    getPickLabel(config.id),
  );
  const state = {
    id: config.id,
    label: config.label,
    config,
    center,
    pickAnchor: anchor ?? null,
    anchorParentName: anchor?.parent?.name || '(unnamed)',
    anchorLocalPosition: anchor?.position.clone() ?? new THREE.Vector3(),
    anchorWorldPosition,
    anchorLocalTransform: anchor
      ? { position: anchor.position.clone(), quaternion: anchor.quaternion.clone(), scale: anchor.scale.clone() }
      : null,
    influence: createInfluenceData(deformer, config),
    marker,
    material,
    labelSprite,
    labelMaterial,
    handleScale: HANDLE_MIN_SCALE,
    heldOffset: new THREE.Vector3(),
    currentDragOffset: new THREE.Vector3(),
    returnOffset: new THREE.Vector3(),
    manualAppliedOffset: new THREE.Vector3(),
    finalAppliedOffset: new THREE.Vector3(),
    manualResultOffset: new THREE.Vector3(),
    dragStartWiggleContribution: new THREE.Vector3(),
    wiggleTargetOffset: new THREE.Vector3(),
    wiggleRawTargetOffset: new THREE.Vector3(),
    wiggleSafeSpringOffset: new THREE.Vector3(),
    wiggleOffset: new THREE.Vector3(),
    wiggleFinalOffset: new THREE.Vector3(),
    effectiveWiggleOffset: new THREE.Vector3(),
    wiggleVelocity: new THREE.Vector3(),
    wiggleAcceleration: new THREE.Vector3(),
    wiggleCandidateOffset: new THREE.Vector3(),
    wiggleVisibleDesiredOffset: new THREE.Vector3(),
    wiggleSolverCandidate: new THREE.Vector3(),
    wiggleManualOffset: new THREE.Vector3(),
    wiggleRemainingPositive: new THREE.Vector3(),
    wiggleRemainingNegative: new THREE.Vector3(),
    wiggleRangePositive: new THREE.Vector3(),
    wiggleRangeNegative: new THREE.Vector3(),
    wiggleRangeTargetPositive: new THREE.Vector3(),
    wiggleRangeTargetNegative: new THREE.Vector3(),
    wiggleRangeInitialized: false,
    wiggleTargetSafeScale: 1,
    wiggleSpringSafeScale: 1,
    wiggleCombinedSafeScale: 1,
    wiggleFinalGuardScale: 1,
    wiggleBoundaryAttenuated: false,
    wiggleFinalGuardReached: false,
    wiggleEnabled: true,
    wiggleControlBlend: 1,
    wiggleDragBlend: 1,
    wiggleEffectiveAmplitude: 0,
    wiggleTargetMagnitude: 0,
    wiggleSpringMagnitude: 0,
    wigglePeakTargetMagnitude: 0,
    wigglePeakSpringMagnitude: 0,
    wiggleDraggingSuppressed: false,
    dragStartOffset: new THREE.Vector3(),
    dragCandidateOffset: new THREE.Vector3(),
    pointerDeltaPx: new THREE.Vector2(),
    dragPlaneWorldDelta: new THREE.Vector3(),
    rawLocalDragDelta: new THREE.Vector3(),
    sensitiveLocalDragDelta: new THREE.Vector3(),
    rawCandidateOffset: new THREE.Vector3(),
    clampedCandidateOffset: new THREE.Vector3(),
    activeDirectionalRadii: new THREE.Vector3(),
    normalizedEllipsoidDistance: 0,
    clampedNormalizedEllipsoidDistance: 0,
    candidateInsideEllipsoid: true,
    hasManualCandidateDiagnostics: false,
    springVelocity: new THREE.Vector3(),
    springAcceleration: new THREE.Vector3(),
    releaseDirection: new THREE.Vector3(),
    releasedStartingMagnitude: 0,
    previousSpringProjection: 0,
    firstOvershootRatio: 0,
    currentOvershootRatio: 0,
    oscillationCount: 0,
    springSettled: true,
    keyboardOffset: new THREE.Vector3(),
    keyboardTarget: new THREE.Vector3(),
    keyboardSafeOffset: new THREE.Vector3(),
    keyboardVelocity: new THREE.Vector3(),
    keyboardAcceleration: new THREE.Vector3(),
    keyboardRandomDirection: new THREE.Vector3(),
    keyboardReleaseDirection: new THREE.Vector3(),
    keyboardSolverCandidate: new THREE.Vector3(),
    keyboardAttackRemaining: 0,
    keyboardStartingMagnitude: 0,
    keyboardKeyHeld: false,
    keyboardPhase: 'idle',
    keyboardLimits: { ...config.limits },
    faceHoverDesiredOffset: new THREE.Vector3(),
    faceHoverSafeOffset: new THREE.Vector3(),
    faceHoverSolverCandidate: new THREE.Vector3(),
    localHandlePosition: new THREE.Vector3(),
    worldHandlePosition: new THREE.Vector3(),
    projectedPosition: new THREE.Vector3(),
    pointerDistancePx: Infinity,
    grabRadiusPx: config.grabRadiusPx,
    visibilityRadiusPx: config.visibilityRadiusPx,
    visibilityProgress: 0,
    visibilityProgressEased: 0,
    closeVisibilityProgress: 0,
    closeVisibilityProgressEased: 0,
    isInsideVisibilityRadius: false,
    isInsideGrabRadius: false,
    isEligible: false,
    occluded: true,
    occlusionHandleDistance: Infinity,
    occlusionFirstHitDistance: Infinity,
  };

  state.active = Boolean(
    state.pickAnchor &&
    state.influence.source === 'authored' &&
    state.influence.indices.length > 0
  );

  marker.name = `${config.id}DeformationHandle`;
  marker.scale.setScalar(state.handleScale);
  marker.renderOrder = 1000;
  labelSprite.name = `${config.id}DeformationLabel`;
  deformer.mesh.add(marker, labelSprite);
  updateRangeDiagnostics(state, state.finalAppliedOffset, state.finalAppliedOffset);
  updateInitialHandlePositions(state);
  return state;
}

function directionalLimitForFactor(factor, minimum, maximum) {
  if (factor === 0) return 0;
  return factor > 0 ? Math.max(0, maximum) * factor : Math.abs(Math.min(0, minimum)) * factor;
}

function updateInitialHandlePositions(state) {
  state.localHandlePosition.copy(state.center);
  state.worldHandlePosition.copy(state.center);
  state.marker.position.copy(state.center);
  state.labelSprite.position.copy(state.center);
  state.labelSprite.position.y += LABEL_LOCAL_Y_OFFSET;
}

function projectOffsetToEllipsoid(offset, limits) {
  const radiusX = offset.x >= 0 ? Math.max(0, limits.maxX) : Math.abs(Math.min(0, limits.minX));
  const radiusY = offset.y >= 0 ? Math.max(0, limits.maxY) : Math.abs(Math.min(0, limits.minY));
  const radiusZ = offset.z >= 0 ? Math.max(0, limits.maxZ) : Math.abs(Math.min(0, limits.minZ));
  let normalizedDistanceSquared = 0;

  if (radiusX <= ELLIPSOID_RADIUS_EPSILON) offset.x = 0;
  else normalizedDistanceSquared += (offset.x / radiusX) ** 2;
  if (radiusY <= ELLIPSOID_RADIUS_EPSILON) offset.y = 0;
  else normalizedDistanceSquared += (offset.y / radiusY) ** 2;
  if (radiusZ <= ELLIPSOID_RADIUS_EPSILON) offset.z = 0;
  else normalizedDistanceSquared += (offset.z / radiusZ) ** 2;

  if (normalizedDistanceSquared > 1) {
    offset.multiplyScalar(1 / Math.sqrt(normalizedDistanceSquared));
  }
  return offset;
}

function normalizedEllipsoidDistance(offset, limits) {
  const radiusX = offset.x >= 0 ? Math.max(0, limits.maxX) : Math.abs(Math.min(0, limits.minX));
  const radiusY = offset.y >= 0 ? Math.max(0, limits.maxY) : Math.abs(Math.min(0, limits.minY));
  const radiusZ = offset.z >= 0 ? Math.max(0, limits.maxZ) : Math.abs(Math.min(0, limits.minZ));
  let distanceSquared = 0;
  if (radiusX <= ELLIPSOID_RADIUS_EPSILON) {
    if (Math.abs(offset.x) > ELLIPSOID_RADIUS_EPSILON) return Infinity;
  } else distanceSquared += (offset.x / radiusX) ** 2;
  if (radiusY <= ELLIPSOID_RADIUS_EPSILON) {
    if (Math.abs(offset.y) > ELLIPSOID_RADIUS_EPSILON) return Infinity;
  } else distanceSquared += (offset.y / radiusY) ** 2;
  if (radiusZ <= ELLIPSOID_RADIUS_EPSILON) {
    if (Math.abs(offset.z) > ELLIPSOID_RADIUS_EPSILON) return Infinity;
  } else distanceSquared += (offset.z / radiusZ) ** 2;
  return Math.sqrt(distanceSquared);
}

function getSafeWiggleOffset(
  manualOffset,
  desiredWiggleOffset,
  limits,
  boundaryMargin,
  targetOffset,
  candidateScratch,
) {
  if (
    !Number.isFinite(manualOffset.x) ||
    !Number.isFinite(manualOffset.y) ||
    !Number.isFinite(manualOffset.z) ||
    !Number.isFinite(desiredWiggleOffset.x) ||
    !Number.isFinite(desiredWiggleOffset.y) ||
    !Number.isFinite(desiredWiggleOffset.z)
  ) {
    targetOffset.set(0, 0, 0);
    return 0;
  }
  if (desiredWiggleOffset.lengthSq() <= 1e-12) {
    targetOffset.set(0, 0, 0);
    return 1;
  }
  // Release spring overshoot may temporarily put the manual center outside its
  // drag ellipsoid. Preserve that manual pose and suppress only Wiggle until it
  // re-enters; never pull the manual deformation toward neutral here.
  if (normalizedEllipsoidDistance(manualOffset, limits) > 1.000001) {
    targetOffset.set(0, 0, 0);
    return 0;
  }

  candidateScratch.copy(manualOffset).add(desiredWiggleOffset);
  if (normalizedEllipsoidDistance(candidateScratch, limits) <= 1) {
    targetOffset.copy(desiredWiggleOffset);
    return 1;
  }

  // The asymmetric ellipsoid is convex along this segment. Find the largest
  // safe scalar without moving the manual center or changing Wiggle direction.
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const middle = (low + high) * 0.5;
    candidateScratch
      .copy(manualOffset)
      .addScaledVector(desiredWiggleOffset, middle);
    if (normalizedEllipsoidDistance(candidateScratch, limits) <= 1) low = middle;
    else high = middle;
  }
  const safeScale = low * (1 - THREE.MathUtils.clamp(boundaryMargin, 0, 0.5));
  targetOffset.copy(desiredWiggleOffset).multiplyScalar(safeScale);
  return safeScale;
}

function updateRangeDiagnostics(state, rawCandidate, clampedCandidate) {
  state.rawCandidateOffset.copy(rawCandidate);
  state.clampedCandidateOffset.copy(clampedCandidate);
  const limits = state.config.limits;
  const x = rawCandidate.x;
  const y = rawCandidate.y;
  const z = rawCandidate.z;
  const radiusX = x >= 0 ? Math.max(0, limits.maxX) : Math.abs(Math.min(0, limits.minX));
  const radiusY = y >= 0 ? Math.max(0, limits.maxY) : Math.abs(Math.min(0, limits.minY));
  const radiusZ = z >= 0 ? Math.max(0, limits.maxZ) : Math.abs(Math.min(0, limits.minZ));
  state.activeDirectionalRadii.set(radiusX, radiusY, radiusZ);
  let distanceSquared = 0;
  let blocked = false;
  for (const [component, radius] of [[x, radiusX], [y, radiusY], [z, radiusZ]]) {
    if (radius <= ELLIPSOID_RADIUS_EPSILON) blocked ||= Math.abs(component) > ELLIPSOID_RADIUS_EPSILON;
    else distanceSquared += (component / radius) ** 2;
  }
  state.normalizedEllipsoidDistance = blocked ? Infinity : Math.sqrt(distanceSquared);
  const clampedRadiusX = clampedCandidate.x >= 0
    ? Math.max(0, limits.maxX) : Math.abs(Math.min(0, limits.minX));
  const clampedRadiusY = clampedCandidate.y >= 0
    ? Math.max(0, limits.maxY) : Math.abs(Math.min(0, limits.minY));
  const clampedRadiusZ = clampedCandidate.z >= 0
    ? Math.max(0, limits.maxZ) : Math.abs(Math.min(0, limits.minZ));
  let clampedDistanceSquared = 0;
  if (clampedRadiusX > ELLIPSOID_RADIUS_EPSILON) {
    clampedDistanceSquared += (clampedCandidate.x / clampedRadiusX) ** 2;
  }
  if (clampedRadiusY > ELLIPSOID_RADIUS_EPSILON) {
    clampedDistanceSquared += (clampedCandidate.y / clampedRadiusY) ** 2;
  }
  if (clampedRadiusZ > ELLIPSOID_RADIUS_EPSILON) {
    clampedDistanceSquared += (clampedCandidate.z / clampedRadiusZ) ** 2;
  }
  state.clampedNormalizedEllipsoidDistance = Math.sqrt(clampedDistanceSquared);
  state.candidateInsideEllipsoid = !blocked && distanceSquared <= 1 + ELLIPSOID_RADIUS_EPSILON;
}

function assignValidatedLimits(target, values) {
  const x0 = Number.isFinite(values.minX) ? values.minX : target.minX;
  const x1 = Number.isFinite(values.maxX) ? values.maxX : target.maxX;
  const y0 = Number.isFinite(values.minY) ? values.minY : target.minY;
  const y1 = Number.isFinite(values.maxY) ? values.maxY : target.maxY;
  const z0 = Number.isFinite(values.minZ) ? values.minZ : target.minZ;
  const z1 = Number.isFinite(values.maxZ) ? values.maxZ : target.maxZ;
  // Neutral is always the ellipsoid origin. Inputs that cross or sit on one
  // side of zero are normalized into negative/positive directional extents.
  target.minX = Math.min(x0, x1, 0);
  target.maxX = Math.max(x0, x1, 0);
  target.minY = Math.min(y0, y1, 0);
  target.maxY = Math.max(y0, y1, 0);
  target.minZ = Math.min(z0, z1, 0);
  target.maxZ = Math.max(z0, z1, 0);
}

function createInfluenceData(deformer, config) {
  const authored = findAuthoredMask(deformer, config);
  if (authored) return authored;

  console.warn(
    `[controls] Strict authored-mask mode rejected ${config.id}: ${config.maskName} ` +
      'is missing or invalid. The control is inactive; no fallback mask exists.',
  );
  return createEmptyInfluence('missing-strict');
}

function createEmptyInfluence(source) {
  return {
    indices: new Uint32Array(),
    weights: new Float32Array(),
    rawIndices: new Uint32Array(),
    rawWeights: new Float32Array(),
    source,
    attributeName: null,
    channel: null,
    minWeight: 0,
    maxWeight: 0,
    minImportedWeight: null,
    maxImportedWeight: null,
    histogram: createHistogram([]),
    lipValidation: null,
    duplicateWeightMismatches: null,
    remapValidation: null,
  };
}

function findAuthoredMask(deformer, config) {
  const geometry = deformer.mesh.geometry;
  const { maskName } = config;
  const normalizedTarget = maskName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const entry = Object.entries(geometry.attributes).find(([name]) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTarget,
  );
  if (!entry) return null;

  const [attributeName, attribute] = entry;
  const positionCount = geometry.getAttribute('position').count;
  if (attribute.count !== positionCount) {
    console.warn(`[controls] ${attributeName} has ${attribute.count} values; expected ${positionCount}.`);
    return null;
  }

  const indices = [];
  const weights = [];
  const rawIndices = [];
  const rawWeights = [];
  const allImportedWeights = new Float32Array(attribute.count);
  const importedWeights = [];
  let excludedAtOrBelowEpsilon = 0;
  let remappedWeightCount = 0;
  let minImportedWeight = Infinity;
  let maxImportedWeight = 0;
  for (let index = 0; index < attribute.count; index += 1) {
    // BufferAttribute getters decode normalized integer storage to numeric 0–1
    // values. No THREE.Color or sRGB conversion is involved for mask data.
    const authoredWeight = attribute.getX(index);
    allImportedWeights[index] = authoredWeight;
    importedWeights.push(authoredWeight);
    if (authoredWeight > 0) {
      minImportedWeight = Math.min(minImportedWeight, authoredWeight);
      maxImportedWeight = Math.max(maxImportedWeight, authoredWeight);
    }
    if (authoredWeight > 0) {
      rawIndices.push(index);
      rawWeights.push(authoredWeight);
    }
    const weight = effectiveAuthoredWeight(authoredWeight);
    if (weight <= 0) {
      if (authoredWeight > 0) excludedAtOrBelowEpsilon += 1;
      continue;
    }
    remappedWeightCount += 1;
    indices.push(index);
    weights.push(weight);
  }
  const histogram = createHistogram(importedWeights);
  const lipValidation = config.id === 'nose'
    ? inspectLipWeights(deformer.originalPositions, allImportedWeights, indices)
    : null;
  const duplicateWeightMismatches = countDuplicateWeightMismatches(
    deformer.originalPositions,
    allImportedWeights,
  );
  const remapValidation = {
    mode: WEIGHT_REMAP_MODE,
    remappedWeightCount,
    excludedAtOrBelowEpsilon,
    preservesMembership: remappedWeightCount === indices.length,
  };
  if (indices.length === 0) {
    console.error(`[controls] ${attributeName} contains no weights above ${WEIGHT_EPSILON}.`);
    return null;
  }
  console.info(`[controls] ${maskName} → ${attributeName}`, {
    affectedVertices: indices.length,
    minimumNonZeroImportedWeight: Number.isFinite(minImportedWeight) ? minImportedWeight : 0,
    maximumImportedWeight: maxImportedWeight,
    histogram,
    effectiveWeight: { WEIGHT_REMAP_MODE, WEIGHT_GAMMA, WEIGHT_GAIN, WEIGHT_EPSILON },
    representativeWeightMapping: getRepresentativeWeightMapping(),
    strictMode: USE_STRICT_AUTHORED_MASKS,
    lipValidation,
    duplicateWeightMismatches,
    remapValidation,
  });
  return {
    indices: Uint32Array.from(indices),
    weights: Float32Array.from(weights),
    rawIndices: Uint32Array.from(rawIndices),
    rawWeights: Float32Array.from(rawWeights),
    source: 'authored',
    attributeName,
    channel: 'r',
    minWeight: weights.length ? Math.min(...weights) : 0,
    maxWeight: weights.length ? Math.max(...weights) : 0,
    minImportedWeight: Number.isFinite(minImportedWeight) ? minImportedWeight : 0,
    maxImportedWeight,
    histogram,
    lipValidation,
    duplicateWeightMismatches,
    remapValidation,
  };
}

function effectiveAuthoredWeight(authoredWeight) {
  if (USE_STRICT_AUTHORED_MASKS) {
    return authoredWeight > WEIGHT_EPSILON
      ? remapWeight(authoredWeight)
      : 0;
  }
  return remapWeight(authoredWeight);
}

function getRepresentativeWeightMapping() {
  return [0, 0.01, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1].map((raw) => ({
    raw,
    effective: effectiveAuthoredWeight(raw),
  }));
}

export function remapAuthoredWeight(authoredWeight) {
  return remapWeight(authoredWeight);
}

function createHistogram(weights) {
  const histogram = {
    exactlyZero: 0,
    '0–0.1': 0,
    '0.1–0.25': 0,
    '0.25–0.5': 0,
    '0.5–0.75': 0,
    '0.75–1.0': 0,
  };
  for (const weight of weights) {
    if (weight === 0) histogram.exactlyZero += 1;
    else if (weight < 0.1) histogram['0–0.1'] += 1;
    else if (weight < 0.25) histogram['0.1–0.25'] += 1;
    else if (weight < 0.5) histogram['0.25–0.5'] += 1;
    else if (weight < 0.75) histogram['0.5–0.75'] += 1;
    else histogram['0.75–1.0'] += 1;
  }
  return histogram;
}

function inspectLipWeights(originalPositions, importedWeights, affectedIndices) {
  const affected = new Set(affectedIndices);
  let lipVertexCount = 0;
  let nonZeroLipVertexCount = 0;
  let affectedLipVertexCount = 0;
  let strongestLipWeight = 0;
  for (let index = 0; index < importedWeights.length; index += 1) {
    const offset = index * 3;
    const x = originalPositions[offset];
    const y = originalPositions[offset + 1];
    const z = originalPositions[offset + 2];
    const nearLips = Math.abs(x) <= 24 && y >= -61 && y <= -37 && z >= 46;
    if (!nearLips) continue;
    lipVertexCount += 1;
    const weight = importedWeights[index];
    strongestLipWeight = Math.max(strongestLipWeight, weight);
    if (weight > WEIGHT_EPSILON) nonZeroLipVertexCount += 1;
    if (affected.has(index)) affectedLipVertexCount += 1;
  }
  return {
    lipVertexCount,
    nonZeroLipVertexCount,
    affectedLipVertexCount,
    strongestLipWeight,
  };
}

function countDuplicateWeightMismatches(originalPositions, importedWeights) {
  const weightsByPosition = new Map();
  for (let index = 0; index < importedWeights.length; index += 1) {
    const offset = index * 3;
    const key = `${originalPositions[offset].toFixed(5)},${originalPositions[offset + 1].toFixed(5)},${originalPositions[offset + 2].toFixed(5)}`;
    const range = weightsByPosition.get(key) ?? [Infinity, -Infinity, 0];
    range[0] = Math.min(range[0], importedWeights[index]);
    range[1] = Math.max(range[1], importedWeights[index]);
    range[2] += 1;
    weightsByPosition.set(key, range);
  }
  let duplicatedPositionGroups = 0;
  let mismatchedGroups = 0;
  for (const [min, max, count] of weightsByPosition.values()) {
    if (count < 2) continue;
    duplicatedPositionGroups += 1;
    if (max - min > WEIGHT_EPSILON) mismatchedGroups += 1;
  }
  return { duplicatedPositionGroups, mismatchedGroups };
}

function createDebugHelper(headMesh, originalPositions, controlStates) {
  const group = new THREE.Group();
  const displacementLines = [];
  const anchorHelpers = [];
  const affectedVertexHelpers = [];
  const controlVisuals = [];
  let anchorsVisible = true;
  let affectedVerticesVisible = true;
  let weightView = 'effective';
  let selectedControlId = controlStates[0]?.id ?? null;

  group.name = 'ManualDeformationControlsDebug';
  group.visible = false;
  group.renderOrder = 999;

  for (let controlIndex = 0; controlIndex < controlStates.length; controlIndex += 1) {
    const state = controlStates[controlIndex];
    const color = new THREE.Color().setHSL(controlIndex / controlStates.length, 0.78, 0.58);
    const region = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
      }),
    );
    const maxRange = new THREE.Mesh(
      new THREE.SphereGeometry(state.config.maxDisplacement, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
        depthTest: false,
      }),
    );
    const centre = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 10, 7),
      new THREE.MeshBasicMaterial({ color, depthTest: false }),
    );
    const affectedVertices = createAffectedVertexHelper(
      originalPositions,
      state.influence.indices,
      state.influence.weights,
    );
    const rawAffectedVertices = createAffectedVertexHelper(
      originalPositions,
      state.influence.rawIndices,
      state.influence.rawWeights,
    );
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(6);
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const line = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({ color, depthTest: false }),
    );

    region.position.copy(state.center);
    region.scale.copy(state.config.debugRegionRadii);
    maxRange.position.copy(state.center);
    centre.position.copy(state.center);
    group.add(region, maxRange, centre, affectedVertices, rawAffectedVertices, line);
    anchorHelpers.push(centre);
    affectedVertexHelpers.push(affectedVertices);
    controlVisuals.push({
      state, region, maxRange, centre, affectedVertices, rawAffectedVertices, line,
    });
    displacementLines.push({ state, linePositions, lineGeometry });
  }
  headMesh.add(group);
  applyVisibility();

  function applyVisibility() {
    for (const visual of controlVisuals) {
      const selected = visual.state.id === selectedControlId;
      visual.region.visible = selected;
      visual.maxRange.visible = selected;
      visual.line.visible = selected;
      visual.affectedVertices.visible =
        selected && affectedVerticesVisible && weightView === 'effective';
      visual.rawAffectedVertices.visible =
        selected && affectedVerticesVisible && weightView === 'raw';
      visual.centre.visible = anchorsVisible;
    }
  }

  return {
    setVisible(value) {
      group.visible = value;
    },
    setAnchorsVisible(value) {
      anchorsVisible = value;
      applyVisibility();
    },
    setAffectedVerticesVisible(value) {
      affectedVerticesVisible = value;
      applyVisibility();
    },
    setSelectedControl(id) {
      selectedControlId = id;
      applyVisibility();
    },
    setWeightView(value) {
      weightView = value === 'raw' ? 'raw' : 'effective';
      applyVisibility();
    },
    update() {
      if (!group.visible) return;
      for (const item of displacementLines) {
        const { center } = item.state;
        const { finalAppliedOffset } = item.state;
        item.linePositions[0] = center.x;
        item.linePositions[1] = center.y;
        item.linePositions[2] = center.z;
        item.linePositions[3] = center.x + finalAppliedOffset.x;
        item.linePositions[4] = center.y + finalAppliedOffset.y;
        item.linePositions[5] = center.z + finalAppliedOffset.z;
        item.lineGeometry.attributes.position.needsUpdate = true;
      }
    },
  };
}

function createLimitDebugHelper(headMesh, controlStates) {
  const group = new THREE.Group();
  const ellipsoidGeometry = new THREE.SphereGeometry(1, 32, 20);
  const unitPositions = Float32Array.from(ellipsoidGeometry.attributes.position.array);
  const ellipsoid = new THREE.Mesh(
    ellipsoidGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x4a9bff,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    }),
  );
  const neutral = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 10, 7),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
  );
  const current = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 10, 7),
    new THREE.MeshBasicMaterial({ color: 0x78bdff, depthTest: false }),
  );
  const linePositions = new Float32Array(6);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0xffcf82, depthTest: false }),
  );
  let selectedControlId = controlStates[0]?.id ?? null;
  group.name = 'DeformationRangeDebug';
  group.visible = false;
  group.renderOrder = 1002;
  group.add(ellipsoid, neutral, current, line);
  headMesh.add(group);

  function update() {
    if (!group.visible) return;
    const state = controlStates.find((control) => control.id === selectedControlId);
    if (!state) return;
    const { minX, maxX, minY, maxY, minZ, maxZ } = state.config.limits;
    const positions = ellipsoidGeometry.attributes.position.array;
    for (let index = 0; index < positions.length; index += 3) {
      const unitX = unitPositions[index];
      const unitY = unitPositions[index + 1];
      const unitZ = unitPositions[index + 2];
      positions[index] = unitX * (unitX >= 0 ? maxX : Math.abs(minX));
      positions[index + 1] = unitY * (unitY >= 0 ? maxY : Math.abs(minY));
      positions[index + 2] = unitZ * (unitZ >= 0 ? maxZ : Math.abs(minZ));
    }
    ellipsoidGeometry.attributes.position.needsUpdate = true;
    ellipsoidGeometry.computeBoundingSphere();
    ellipsoid.position.copy(state.center);
    neutral.position.copy(state.center);
    current.position.copy(state.localHandlePosition);
    linePositions[0] = state.center.x;
    linePositions[1] = state.center.y;
    linePositions[2] = state.center.z;
    linePositions[3] = state.localHandlePosition.x;
    linePositions[4] = state.localHandlePosition.y;
    linePositions[5] = state.localHandlePosition.z;
    lineGeometry.attributes.position.needsUpdate = true;
  }

  return {
    update,
    refresh() {
      update();
    },
    setVisible(value) {
      group.visible = value;
      update();
    },
    setSelectedControl(controlId) {
      selectedControlId = controlId;
      update();
    },
  };
}

function createAffectedVertexHelper(originalPositions, indices, weights) {
  const positions = new Float32Array(indices.length * 3);
  const colors = new Float32Array(indices.length * 3);
  const color = new THREE.Color();
  for (let index = 0; index < indices.length; index += 1) {
    const sourceOffset = indices[index] * 3;
    const targetOffset = index * 3;
    positions[targetOffset] = originalPositions[sourceOffset];
    positions[targetOffset + 1] = originalPositions[sourceOffset + 1];
    positions[targetOffset + 2] = originalPositions[sourceOffset + 2];
    effectiveWeightToColor(weights[index], color);
    colors[targetOffset] = color.r;
    colors[targetOffset + 1] = color.g;
    colors[targetOffset + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ vertexColors: true, size: 1.4, depthTest: true }),
  );
  points.renderOrder = 1000;
  return points;
}

function effectiveWeightToColor(weight, target) {
  // Blue → cyan → green → yellow → red, using the exact effective weight.
  target.setHSL((1 - THREE.MathUtils.clamp(weight, 0, 1)) * 0.66, 1, 0.5);
}

function createCircleTexture() {
  const textureCanvas = document.createElement('canvas');
  const size = 64;
  const context = textureCanvas.getContext('2d');
  textureCanvas.width = size;
  textureCanvas.height = size;
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.82)';
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(220, 239, 255, 0.95)';
  context.stroke();
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelSprite(label) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 96;
  context.fillStyle = 'rgba(10, 18, 28, 0.78)';
  context.fillRect(0, 8, canvas.width, 80);
  context.strokeStyle = 'rgba(111, 184, 255, 0.9)';
  context.lineWidth = 4;
  context.strokeRect(2, 10, canvas.width - 4, 76);
  context.fillStyle = '#eef7ff';
  context.font = '600 42px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.84,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(5.8, 1.08, 1);
  sprite.visible = false;
  sprite.renderOrder = 1001;
  return { sprite, material };
}

function getPickLabel(controlId) {
  return {
    nose: 'Nose',
    earLeft: 'Ear Left',
    earRight: 'Ear Right',
    eyebrowLeft: 'Eyebrow Left',
    eyebrowRight: 'Eyebrow Right',
    mouthLeft: 'Mouth Left',
    mouthRight: 'Mouth Right',
    mouthCenter: 'Mouth Center',
    chin: 'Chin',
    cheekLeft: 'Cheek Left',
    cheekRight: 'Cheek Right',
    forehead: 'Forehead',
    bridge: 'Bridge',
  }[controlId] ?? controlId;
}

function summarizeControl(state) {
  return {
    id: state.id,
    active: state.active,
    pickAnchor: state.config.pickName,
    pickFound: Boolean(state.pickAnchor),
    anchorParent: state.anchorParentName,
    anchorLocalPosition: state.anchorLocalPosition.toArray(),
    anchorWorldPosition: state.anchorWorldPosition.toArray(),
    center: state.center.toArray(),
    mask: state.config.maskName,
    maskSource: state.influence.source,
    attributeName: state.influence.attributeName,
    affectedVertices: state.influence.indices.length,
  };
}
