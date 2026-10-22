import * as THREE from 'three';

const LEFT_MORPH_NAME = 'EyeLeft_HalfClose';
const RIGHT_MORPH_NAME = 'EyeRight_HalfClose';
const BLINK_MORPH_NAME = 'Blink_center';
const EYE_CLICK_MAX_DISTANCE_PX = 6;
const EYE_CLICK_MAX_DURATION_MS = 500;
// Visual validation of this export showed Blender's morph-side naming is
// opposite the imported eyeball-object naming. Keep the screen region aligned
// with the eyelid directly over it.
const SWAP_EXPORTED_HALF_CLOSE_SIDES = true;

export const EYE_HOVER_CLOSE_CONFIG = Object.freeze({
  enabled: true,
  outerRadiusScale: 1.15,
  innerRadiusScale: 0.28,
  releaseSpeed: 1.5,
  maxInfluence: 1,
  eyeHoverWiggleEnabled: true,
  eyeHoverWiggleStart: 0.90,
  eyeHoverWiggleMin: 0.90,
  eyeHoverWiggleMax: 1.00,
  eyeHoverWiggleFrequency: 11,
  eyeHoverWiggleIrregularity: 0.15,
  eyeHoverWiggleFadeIn: 0.06,
  eyeHoverWiggleFadeOut: 0.10,
  faceHoverSideEnabled: true,
  faceHoverEaseIn: 0.08,
  faceHoverEaseOut: 0.14,
  deltaClamp: 1 / 30,
  debug: false,
});

export function initializeEyeHoverClose({
  modelRoot,
  camera,
  canvas,
  pointer,
  headReactionConfig = null,
  onHeadReactionTargetChange = null,
  onFaceHoverAmountsChange = null,
  onEyeClick = null,
  isInteractionCursorReserved = null,
  config = EYE_HOVER_CLOSE_CONFIG,
}) {
  const morphMesh = findMorphMesh(modelRoot);
  const dictionary = morphMesh?.morphTargetDictionary ?? {};
  const leftMorphIndex = dictionary[LEFT_MORPH_NAME];
  const rightMorphIndex = dictionary[RIGHT_MORPH_NAME];
  const blinkIndex = dictionary[BLINK_MORPH_NAME];
  const leftEye = createEyeRegion(
    modelRoot,
    'Eye_Left',
    SWAP_EXPORTED_HALF_CLOSE_SIDES ? rightMorphIndex : leftMorphIndex,
  );
  const rightEye = createEyeRegion(
    modelRoot,
    'Eye_Right',
    SWAP_EXPORTED_HALF_CLOSE_SIDES ? leftMorphIndex : rightMorphIndex,
  );
  const eyeStates = [leftEye, rightEye];
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const radiusPointWorld = new THREE.Vector3();
  const radiusPointNdc = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  let enabled = Boolean(config.enabled);
  let debugElapsed = 0;
  let eyePress = null;

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', clearEyePress);
  canvas.addEventListener('pointerleave', handlePointerLeave);

  if (!morphMesh) {
    console.warn(
      `[eye-hover-close] No mesh containing ${LEFT_MORPH_NAME} or ` +
        `${RIGHT_MORPH_NAME} was found. The feature is disabled.`,
    );
    return createDisabledController();
  }
  if (!Number.isInteger(leftMorphIndex)) {
    console.warn(`[eye-hover-close] Missing morph target: ${LEFT_MORPH_NAME}.`);
  }
  if (!Number.isInteger(rightMorphIndex)) {
    console.warn(`[eye-hover-close] Missing morph target: ${RIGHT_MORPH_NAME}.`);
  }
  if (!leftEye.eye) {
    console.warn('[eye-hover-close] Eye_Left was not found or contains no mesh.');
  }
  if (!rightEye.eye) {
    console.warn('[eye-hover-close] Eye_Right was not found or contains no mesh.');
  }

  resetEyeHoverClose();
  console.info(
    `[eye-hover-close] ${morphMesh.name}: ` +
      `${LEFT_MORPH_NAME} index ${formatIndex(leftMorphIndex)}; ` +
      `${RIGHT_MORPH_NAME} index ${formatIndex(rightMorphIndex)}; ` +
      `${BLINK_MORPH_NAME} index ${formatIndex(blinkIndex)}. ` +
      `Visual mapping: Eye_Left → index ${formatIndex(leftEye.morphIndex)}, ` +
      `Eye_Right → index ${formatIndex(rightEye.morphIndex)} ` +
      `(exported half-close sides swapped: ${SWAP_EXPORTED_HALF_CLOSE_SIDES}).`,
  );

  function updateEyeHoverClose(deltaTime) {
    if (!enabled) return;

    const delta = Math.min(Math.max(deltaTime, 0), config.deltaClamp);
    refreshEyeRegions();
    for (const state of eyeStates) {
      // Cursor approach should feel direct: only the reopening path is delayed.
      state.current = state.target >= state.current
        ? state.target
        : moveTowards(state.current, state.target, config.releaseSpeed * delta);
      updateEyeWiggle(state, delta);
      updateFaceHoverAmount(state, delta);
    }

    const blinkValue = Number.isInteger(blinkIndex)
      ? THREE.MathUtils.clamp(morphMesh.morphTargetInfluences[blinkIndex] ?? 0, 0, 1)
      : 0;
    applyHoverInfluence(leftEye, blinkValue);
    applyHoverInfluence(rightEye, blinkValue);
    onFaceHoverAmountsChange?.(
      leftEye.faceHoverAmount,
      rightEye.faceHoverAmount,
      config,
    );
    updateHeadReactionTarget();
    updatePointerCursor();

    if (config.debug) {
      debugElapsed += delta;
      if (debugElapsed >= 0.5) {
        debugElapsed = 0;
        console.info('[eye-hover-close] State:', {
          left: inspectEyeState(leftEye),
          right: inspectEyeState(rightEye),
          blinkValue,
        });
      }
    }
  }

  function refreshEyeRegions() {
    const bounds = canvas.getBoundingClientRect();
    camera.updateWorldMatrix(true, false);
    camera.matrixWorld.extractBasis(cameraRight, cameraUp, cameraForward);
    cameraRight.normalize();

    for (const state of eyeStates) {
      updateProjectedEyeRegion(state, bounds);
      state.target = calculateTarget(state);
    }
  }

  function updateProjectedEyeRegion(state, bounds) {
    if (!state.eye || !Number.isInteger(state.morphIndex)) {
      state.projectedRadius = 0;
      state.visible = false;
      return;
    }

    state.eye.updateWorldMatrix(true, false);
    state.worldCenter
      .copy(state.localSphere.center)
      .applyMatrix4(state.eye.matrixWorld);
    state.eye.getWorldScale(worldScale);
    const worldRadius = state.localSphere.radius * Math.max(
      Math.abs(worldScale.x),
      Math.abs(worldScale.y),
      Math.abs(worldScale.z),
    );

    state.ndcCenter.copy(state.worldCenter).project(camera);
    radiusPointWorld
      .copy(state.worldCenter)
      .addScaledVector(cameraRight, worldRadius);
    radiusPointNdc.copy(radiusPointWorld).project(camera);

    state.screenCenter.set(
      bounds.left + (state.ndcCenter.x + 1) * 0.5 * bounds.width,
      bounds.top + (1 - state.ndcCenter.y) * 0.5 * bounds.height,
    );
    state.radiusScreenPoint.set(
      bounds.left + (radiusPointNdc.x + 1) * 0.5 * bounds.width,
      bounds.top + (1 - radiusPointNdc.y) * 0.5 * bounds.height,
    );
    state.projectedRadius = state.screenCenter.distanceTo(state.radiusScreenPoint);
    state.visible = state.ndcCenter.z >= -1 &&
      state.ndcCenter.z <= 1 &&
      state.projectedRadius > 0.5;
  }

  function calculateTarget(state) {
    if (!pointer.inside || !state.visible) {
      state.pointerDistance = Infinity;
      state.isPointerInsideOuterRadius = false;
      return 0;
    }
    state.pointerDistance = pointer.client.distanceTo(state.screenCenter);
    const innerRadius = state.projectedRadius * config.innerRadiusScale;
    const outerRadius = state.projectedRadius * config.outerRadiusScale;
    state.isPointerInsideOuterRadius = state.pointerDistance < outerRadius;
    if (state.pointerDistance <= innerRadius) return config.maxInfluence;
    if (!state.isPointerInsideOuterRadius) return 0;
    const progress = THREE.MathUtils.clamp(
      (state.pointerDistance - innerRadius) / (outerRadius - innerRadius),
      0,
      1,
    );
    const eased = progress * progress * (3 - 2 * progress);
    return (1 - eased) * config.maxInfluence;
  }

  function getHoveredEye() {
    let result = null;
    for (const state of eyeStates) {
      if (!state.isPointerInsideOuterRadius) continue;
      if (!result || state.pointerDistance < result.pointerDistance) result = state;
    }
    return result;
  }

  function updatePointerCursor() {
    if (isInteractionCursorReserved?.()) return;
    canvas.style.cursor = getHoveredEye() ? 'pointer' : '';
  }

  function handlePointerDown(event) {
    if (!enabled || event.button !== 0 || isInteractionCursorReserved?.()) return;
    pointer.updateFromEvent(event);
    refreshEyeRegions();
    const hoveredEye = getHoveredEye();
    if (!hoveredEye) return;

    eyePress = {
      pointerId: event.pointerId,
      eye: hoveredEye,
      clientX: event.clientX,
      clientY: event.clientY,
      eyeCenterX: hoveredEye.screenCenter.x,
      eyeCenterY: hoveredEye.screenCenter.y,
      eyeOuterRadius: hoveredEye.projectedRadius * config.outerRadiusScale,
      startedAt: performance.now(),
      exceededDistance: false,
    };
  }

  function handlePointerMove(event) {
    if (!eyePress || event.pointerId !== eyePress.pointerId) return;
    const distance = Math.hypot(
      event.clientX - eyePress.clientX,
      event.clientY - eyePress.clientY,
    );
    if (distance >= EYE_CLICK_MAX_DISTANCE_PX) eyePress.exceededDistance = true;
  }

  function handlePointerUp(event) {
    if (!eyePress || event.pointerId !== eyePress.pointerId) return;
    const press = eyePress;
    eyePress = null;
    pointer.updateFromEvent(event);
    refreshEyeRegions();
    const duration = performance.now() - press.startedAt;
    const releaseEye = getHoveredEye();
    const stillOverPressedEye = Math.hypot(
      event.clientX - press.eyeCenterX,
      event.clientY - press.eyeCenterY,
    ) < press.eyeOuterRadius;
    if (
      !press.exceededDistance &&
      duration < EYE_CLICK_MAX_DURATION_MS &&
      (releaseEye === press.eye || stillOverPressedEye) &&
      !isInteractionCursorReserved?.()
    ) {
      onEyeClick?.(press.eye.objectName);
    }
  }

  function clearEyePress() {
    eyePress = null;
  }

  function handlePointerLeave() {
    clearEyePress();
    if (!isInteractionCursorReserved?.()) canvas.style.cursor = '';
  }

  function updateHeadReactionTarget() {
    if (!onHeadReactionTargetChange) return;
    if (!headReactionConfig?.enabled) {
      clearReactionReference(leftEye);
      clearReactionReference(rightEye);
      onHeadReactionTargetChange(0, 0);
      return;
    }
    if (!pointer.inside) {
      clearReactionReference(leftEye);
      clearReactionReference(rightEye);
      onHeadReactionTargetChange(0, 0);
      return;
    }

    let weightedDirectionY = 0;
    let totalStrength = 0;
    let leftStrength = 0;
    let rightStrength = 0;

    for (const state of eyeStates) {
      const isMeaningfullyActive = state.target >= headReactionConfig.activationThreshold;
      if (!state.reactionActive && isMeaningfullyActive) {
        captureReactionReference(state);
      }
      if (!state.reactionActive) continue;

      const strength = calculateReferenceStrength(state);
      if (strength < headReactionConfig.activationThreshold) {
        clearReactionReference(state);
        continue;
      }

      state.reactionOffset.copy(pointer.client).sub(state.reactionReferenceCenter);
      const offsetLength = state.reactionOffset.length();
      if (offsetLength > 0.001) {
        state.reactionDirection.copy(state.reactionOffset).multiplyScalar(1 / offsetLength);
      }

      weightedDirectionY += state.reactionDirection.y * strength;
      totalStrength += strength;
      if (state === leftEye) leftStrength = strength;
      if (state === rightEye) rightStrength = strength;
    }

    if (totalStrength === 0) {
      onHeadReactionTargetChange(0, 0);
      return;
    }

    // Yaw is intentionally tied only to the active eye identity. This keeps
    // its direction stable while the cursor moves across one eyeball.
    const yawInfluence = THREE.MathUtils.clamp(leftStrength - rightStrength, -1, 1);

    // Pitch remains a direction-aware reaction. Dividing only when the
    // combined strength exceeds one prevents two eyes from doubling its range.
    const normalization = 1 / Math.max(1, totalStrength);
    const pitchInfluence = THREE.MathUtils.clamp(
      -weightedDirectionY * normalization,
      -1,
      1,
    );
    onHeadReactionTargetChange(yawInfluence, pitchInfluence);
  }

  function captureReactionReference(state) {
    state.reactionActive = true;
    state.reactionReferenceCenter.copy(state.screenCenter);
    state.reactionReferenceRadius = state.projectedRadius;
    state.reactionOffset.copy(pointer.client).sub(state.reactionReferenceCenter);
    const offsetLength = state.reactionOffset.length();
    if (offsetLength > 0.001) {
      state.reactionDirection.copy(state.reactionOffset).multiplyScalar(1 / offsetLength);
    }
  }

  function calculateReferenceStrength(state) {
    const center = headReactionConfig.useStableEyeReference
      ? state.reactionReferenceCenter
      : state.screenCenter;
    const radius = headReactionConfig.useStableEyeReference
      ? state.reactionReferenceRadius
      : state.projectedRadius;
    const distance = pointer.client.distanceTo(center);
    const innerRadius = radius * config.innerRadiusScale;
    const outerRadius = radius * config.outerRadiusScale;
    if (distance <= innerRadius) return config.maxInfluence;
    if (distance >= outerRadius || outerRadius <= innerRadius) return 0;
    const progress = THREE.MathUtils.clamp(
      (distance - innerRadius) / (outerRadius - innerRadius),
      0,
      1,
    );
    const eased = progress * progress * (3 - 2 * progress);
    return (1 - eased) * config.maxInfluence;
  }

  function clearReactionReference(state) {
    state.reactionActive = false;
    state.reactionReferenceRadius = 0;
  }

  function applyHoverInfluence(state, blinkValue) {
    if (!Number.isInteger(state.morphIndex)) return;
    const blinkPriority = 1 - smoothstep(0.2, 0.85, blinkValue);
    const wiggleBlend = state.wiggleEnvelope * blinkPriority;
    state.hoverInfluence = THREE.MathUtils.lerp(
      state.current,
      state.wiggleInfluence,
      wiggleBlend,
    );
    state.effective = state.hoverInfluence * (1 - blinkValue);
    morphMesh.morphTargetInfluences[state.morphIndex] = state.effective;
  }

  function updateEyeWiggle(state, delta) {
    const minInfluence = THREE.MathUtils.clamp(
      Math.min(config.eyeHoverWiggleMin, config.eyeHoverWiggleMax),
      0,
      1,
    );
    const maxInfluence = THREE.MathUtils.clamp(
      Math.max(config.eyeHoverWiggleMin, config.eyeHoverWiggleMax),
      minInfluence,
      1,
    );
    const irregularity = THREE.MathUtils.clamp(
      config.eyeHoverWiggleIrregularity,
      0,
      1,
    );
    const speedVariation =
      Math.sin(state.wiggleTime * 4.3 + state.wiggleSeed) * 0.67 +
      Math.sin(state.wiggleTime * 7.1 + state.wiggleSeed * 1.71) * 0.33;
    const frequency = Math.max(
      0,
      config.eyeHoverWiggleFrequency * (1 + speedVariation * irregularity),
    );
    state.wiggleTime += delta;
    state.wigglePhase += Math.PI * 2 * frequency * delta;

    const amplitudeVariation = 1 - irregularity * 0.18 * (
      0.5 + 0.5 * Math.sin(state.wiggleTime * 5.7 + state.wiggleSeed * 2.13)
    );
    const center = (minInfluence + maxInfluence) * 0.5;
    const amplitude = (maxInfluence - minInfluence) * 0.5 * amplitudeVariation;
    const organicPhase = state.wigglePhase +
      irregularity * 0.22 * Math.sin(state.wiggleTime * 8.9 + state.wiggleSeed * 0.83);
    state.wiggleInfluence = THREE.MathUtils.clamp(
      center + Math.sin(organicPhase) * amplitude,
      minInfluence,
      maxInfluence,
    );

    const wiggleTarget = config.eyeHoverWiggleEnabled
      ? smoothstep(config.eyeHoverWiggleStart, 1, state.current)
      : 0;
    const fadeDuration = wiggleTarget >= state.wiggleEnvelope
      ? config.eyeHoverWiggleFadeIn
      : config.eyeHoverWiggleFadeOut;
    const envelopeStep = fadeDuration > 0 ? delta / fadeDuration : 1;
    state.wiggleEnvelope = moveTowards(
      state.wiggleEnvelope,
      wiggleTarget,
      envelopeStep,
    );
  }

  function updateFaceHoverAmount(state, delta) {
    const target = config.faceHoverSideEnabled ? smoothstep(0, 1, state.current) : 0;
    const duration = target >= state.faceHoverAmount
      ? config.faceHoverEaseIn
      : config.faceHoverEaseOut;
    state.faceHoverAmount = moveTowards(
      state.faceHoverAmount,
      target,
      duration > 0 ? delta / duration : 1,
    );
    if (target === 0 && state.faceHoverAmount < 0.0001) state.faceHoverAmount = 0;
  }

  function resetEyeHoverClose() {
    for (const state of eyeStates) {
      state.current = 0;
      state.target = 0;
      state.effective = 0;
      state.hoverInfluence = 0;
      state.wiggleEnvelope = 0;
      state.wiggleInfluence = config.eyeHoverWiggleMin;
      state.faceHoverAmount = 0;
      state.isPointerInsideOuterRadius = false;
      clearReactionReference(state);
      if (morphMesh?.morphTargetInfluences && Number.isInteger(state.morphIndex)) {
        morphMesh.morphTargetInfluences[state.morphIndex] = 0;
      }
    }
    onHeadReactionTargetChange?.(0, 0);
    onFaceHoverAmountsChange?.(0, 0, config);
  }

  function setEyeHoverCloseEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) {
      clearEyePress();
      resetEyeHoverClose();
      if (!isInteractionCursorReserved?.()) canvas.style.cursor = '';
    }
  }

  function dispose() {
    resetEyeHoverClose();
    enabled = false;
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointercancel', clearEyePress);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
  }

  return {
    config,
    morphMesh,
    leftEye,
    rightEye,
    leftMorphIndex,
    rightMorphIndex,
    blinkIndex,
    get enabled() { return enabled; },
    updateEyeHoverClose,
    resetEyeHoverClose,
    setEyeHoverCloseEnabled,
    setEnabled: setEyeHoverCloseEnabled,
    dispose,
  };
}

function createEyeRegion(modelRoot, objectName, morphIndex) {
  const object = modelRoot?.getObjectByName(objectName);
  const eye = object?.isMesh ? object : findFirstMesh(object);
  const localSphere = new THREE.Sphere();
  if (eye?.geometry) {
    if (!eye.geometry.boundingSphere) eye.geometry.computeBoundingSphere();
    localSphere.copy(eye.geometry.boundingSphere);
  }
  return {
    objectName,
    eye,
    morphIndex,
    localSphere,
    worldCenter: new THREE.Vector3(),
    ndcCenter: new THREE.Vector3(),
    screenCenter: new THREE.Vector2(),
    radiusScreenPoint: new THREE.Vector2(),
    projectedRadius: 0,
    pointerDistance: Infinity,
    isPointerInsideOuterRadius: false,
    current: 0,
    target: 0,
    effective: 0,
    hoverInfluence: 0,
    wiggleEnvelope: 0,
    wiggleInfluence: 0,
    faceHoverAmount: 0,
    wiggleTime: Math.random() * 10,
    wigglePhase: Math.random() * Math.PI * 2,
    wiggleSeed: Math.random() * Math.PI * 2,
    visible: false,
    reactionActive: false,
    reactionReferenceCenter: new THREE.Vector2(),
    reactionReferenceRadius: 0,
    reactionOffset: new THREE.Vector2(),
    reactionDirection: new THREE.Vector2(),
  };
}

function findMorphMesh(modelRoot) {
  let bestMesh = null;
  let bestMatchCount = 0;
  modelRoot?.traverse((object) => {
    if (!object.isMesh || !object.morphTargetDictionary) return;
    const dictionary = object.morphTargetDictionary;
    const matchCount = Number(LEFT_MORPH_NAME in dictionary) +
      Number(RIGHT_MORPH_NAME in dictionary);
    if (matchCount > bestMatchCount) {
      bestMesh = object;
      bestMatchCount = matchCount;
    }
  });
  return bestMesh;
}

function findFirstMesh(root) {
  let result = null;
  root?.traverse((object) => {
    if (!result && object.isMesh) result = object;
  });
  return result;
}

function moveTowards(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function inspectEyeState(state) {
  return {
    object: state.eye?.name ?? null,
    morphIndex: state.morphIndex ?? null,
    projectedRadius: state.projectedRadius,
    pointerDistance: state.pointerDistance,
    target: state.target,
    current: state.current,
    hoverInfluence: state.hoverInfluence,
    wiggleEnvelope: state.wiggleEnvelope,
    wiggleInfluence: state.wiggleInfluence,
    faceHoverAmount: state.faceHoverAmount,
    effective: state.effective,
  };
}

function formatIndex(index) {
  return Number.isInteger(index) ? index : 'missing';
}

function createDisabledController() {
  return {
    config: EYE_HOVER_CLOSE_CONFIG,
    morphMesh: null,
    leftEye: null,
    rightEye: null,
    leftMorphIndex: null,
    rightMorphIndex: null,
    blinkIndex: null,
    enabled: false,
    updateEyeHoverClose() {},
    resetEyeHoverClose() {},
    setEyeHoverCloseEnabled() {},
    setEnabled() {},
    dispose() {},
  };
}
