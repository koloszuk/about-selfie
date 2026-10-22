import * as THREE from 'three';

export const EYE_OBJECT_NAMES = Object.freeze(['Eye_Right_Base', 'Eye_Left_Base']);
const EYE_DEFINITIONS = Object.freeze([
  { key: 'Eye_Right', base: ['Eye_Right_Base', 'Eye_Right'], cornea: ['Eye_Right_Cornea'] },
  { key: 'Eye_Left', base: ['Eye_Left_Base', 'Eye_Left'], cornea: ['Eye_Left_Cornea'] },
]);
export const EYE_YAW_MAX = THREE.MathUtils.degToRad(18);
export const EYE_OPPOSITE_YAW_EXTRA = THREE.MathUtils.degToRad(6);
export const EYE_EXPANSION_START_HEAD_YAW = THREE.MathUtils.degToRad(8);
export const EYE_EXPANSION_FULL_HEAD_YAW = THREE.MathUtils.degToRad(28);
export const EYE_VERTICAL_LIMIT = THREE.MathUtils.degToRad(12);
export const EYE_CENTER_DEAD_ZONE = 0.06;
export const EYE_FOLLOW_SMOOTHING = 1.0;
export const EYE_RETURN_SMOOTHING = 14;
// A face-local virtual plane keeps the full symmetric gaze range available
// regardless of where OrbitControls has moved the camera.
export const EYE_LOCAL_GAZE_TARGET_DISTANCE = 180;
export const EYE_TRACKING_DEBUG = false;

// Keyboard Mode: Shift holds both eyes at their fully extended position.
// Distances are in the imported eye-parent's local space. The model root later
// applies its display normalization, just like the existing face controls.
export const EYE_POP_CONFIG = Object.freeze({
  maxDistance: 18,
  // Imported-model local units. Negative local Y lowers the extended eyes,
  // revealing the eyebrow region without changing their gaze rotation.
  downwardOffsetAtFullPop: 4.5,
  attackStrength: 520,
  attackDamping: 15,
  attackInitialVelocity: 180,
  releaseStrength: 500,
  releaseDamping: 10,
  releaseInitialVelocity: 4,
  springMass: 1,
  settleThreshold: 0.0002,
  maxDeltaTime: 1 / 30,
  maxSubstepTime: 1 / 120,
  // The normal value is a calibration baseline: dividing by it preserves the
  // existing rest-position solve exactly. At full extension, 0.95 / 0.72
  // produces a visibly stronger target response without altering normal gaze.
  normalTrackingStrength: 0.72,
  poppedTrackingStrength: 0.95,
  poppedMaxYaw: THREE.MathUtils.degToRad(34),
  poppedMaxPitch: THREE.MathUtils.degToRad(26),
});

// Optional per-eye calibration offsets in radians: [pitch, yaw, roll].
export const EYE_ROTATION_OFFSETS = Object.freeze({
  Eye_Right: Object.freeze([0, 0, 0]),
  Eye_Left: Object.freeze([0, 0, 0]),
});

export function createEyeFollower({ head, pointer, camera, eyePopConfig = EYE_POP_CONFIG }) {
  const targetGaze = new THREE.Vector2();
  const currentGaze = new THREE.Vector2();
  const gazeTargetWorld = new THREE.Vector3();
  const eyeMidpointWorld = new THREE.Vector3();
  const gazeCenterLocal = new THREE.Vector3();
  const gazeOffsetLocal = new THREE.Vector3();
  const targetInParentLocal = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const cameraInReferenceLocal = new THREE.Vector3();
  const cameraDirectionInRestSpace = new THREE.Vector3();
  const eyeWorldPosition = new THREE.Vector3();
  const directionInRestSpace = new THREE.Vector3();
  const desiredLocalRotation = new THREE.Quaternion();
  const deltaRotation = new THREE.Quaternion();
  const deltaEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const eyePivots = EYE_DEFINITIONS.map(
    (definition) => createEyePivot(head, definition, eyePopConfig),
  );
  const gaze = { x: 0, y: 0, leftY: 0, rightY: 0 };
  let enabled = true;
  let forcedGaze = null;
  let eyePopHeld = false;
  let eyePopPosition = 0;
  let eyePopVelocity = 0;
  let eyePopSettled = true;
  let headViewYaw = 0;
  let debugElapsed = 0;
  let idleMode = false;

  console.info('[head.glb] Eye meshes:', eyePivots.map((eye) => ({
    base: eye.eye.name,
    cornea: eye.cornea?.name ?? null,
  })));

  function setEnabled(value) {
    enabled = value;
  }

  function setIdleMode(value) {
    idleMode = Boolean(value);
    if (!idleMode) return;
    targetGaze.set(0, 0);
    currentGaze.set(0, 0);
    gaze.x = 0;
    gaze.y = 0;
    gaze.leftY = 0;
    gaze.rightY = 0;
    eyePopHeld = false;
    eyePopPosition = 0;
    eyePopVelocity = 0;
    eyePopSettled = true;
    applyEyePopPosition(0);
    for (const eye of eyePivots) {
      eye.pivot.quaternion.copy(eye.restLocalRotation);
    }
  }

  function setForcedGaze(x, y) {
    if (x === null || y === null) {
      forcedGaze = null;
      return;
    }

    forcedGaze ??= new THREE.Vector2();
    forcedGaze.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    );
  }

  function updateGaze(delta) {
    if (idleMode) return;
    const activelyFollowing = updateTargetGaze();
    const interpolation = activelyFollowing
      ? getFollowInterpolation(delta)
      : 1 - Math.exp(-EYE_RETURN_SMOOTHING * delta);
    currentGaze.lerp(targetGaze, interpolation);

    if (currentGaze.distanceToSquared(targetGaze) < 0.000001) {
      currentGaze.copy(targetGaze);
    }

    if (Math.abs(currentGaze.x) < 0.0001) currentGaze.x = 0;
    if (Math.abs(currentGaze.y) < 0.0001) currentGaze.y = 0;

    // Preserve the authored brow/squint dead zone while the 3D eye ray uses
    // the exact smoothed pointer NDC stored in currentGaze.
    gaze.x = applyDeadZone(currentGaze.x, EYE_CENTER_DEAD_ZONE);
    gaze.y = currentGaze.y;
    gaze.leftY = currentGaze.y;
    gaze.rightY = currentGaze.y;
  }

  function updateEyes(delta) {
    if (idleMode) return;
    updateEyePop(delta);
    const activelyFollowing = Boolean(forcedGaze) || (enabled && pointer.inside);
    if (!activelyFollowing) {
      const interpolation = 1 - Math.exp(-EYE_RETURN_SMOOTHING * delta);
      for (const eye of eyePivots) {
        eye.pivot.quaternion.slerp(eye.restLocalRotation, interpolation);
      }
      return;
    }

    updateGazeTargetWorld();
    updateHeadViewYaw();

    const interpolation = getFollowInterpolation(delta);
    let logDebugFrame = false;
    if (EYE_TRACKING_DEBUG) {
      debugElapsed += delta;
      if (debugElapsed >= 0.5) {
        debugElapsed = 0;
        logDebugFrame = true;
      }
    }
    for (const eye of eyePivots) {
      solveEyeRotation(eye, interpolation, logDebugFrame);
    }
  }

  function setEyePopHeld(value) {
    const nextHeld = Boolean(value);
    if (nextHeld === eyePopHeld) return false;
    eyePopHeld = nextHeld;
    eyePopSettled = false;

    if (eyePopHeld) {
      // A fresh outward impulse gives the press a fast ease-out attack and
      // enough energy to pass the target once before the spring settles.
      eyePopVelocity = Math.max(eyePopVelocity, eyePopConfig.attackInitialVelocity);
    } else {
      // Release from the exact visible pose, with the same underdamped elastic
      // character used by the manual deformation controls.
      eyePopVelocity = Math.min(
        eyePopVelocity,
        -eyePopConfig.maxDistance * eyePopConfig.releaseInitialVelocity,
      );
    }
    return true;
  }

  function updateEyePop(delta) {
    const target = eyePopHeld ? eyePopConfig.maxDistance : 0;
    if (eyePopSettled && Math.abs(eyePopPosition - target) <= eyePopConfig.settleThreshold) {
      applyEyePopPosition(target);
      return;
    }

    const cappedDelta = Math.min(Math.max(delta, 0), eyePopConfig.maxDeltaTime);
    const substepCount = Math.max(1, Math.ceil(cappedDelta / eyePopConfig.maxSubstepTime));
    const step = cappedDelta / substepCount;
    const stiffness = eyePopHeld
      ? eyePopConfig.attackStrength
      : eyePopConfig.releaseStrength;
    const damping = eyePopHeld
      ? eyePopConfig.attackDamping
      : eyePopConfig.releaseDamping;

    for (let index = 0; index < substepCount; index += 1) {
      const acceleration = (
        stiffness * (target - eyePopPosition) - damping * eyePopVelocity
      ) / eyePopConfig.springMass;
      eyePopVelocity += acceleration * step;
      eyePopPosition += eyePopVelocity * step;
    }

    const velocityThreshold = eyePopConfig.settleThreshold *
      Math.sqrt(stiffness / eyePopConfig.springMass);
    if (
      Math.abs(eyePopPosition - target) <= eyePopConfig.settleThreshold &&
      Math.abs(eyePopVelocity) <= velocityThreshold
    ) {
      eyePopPosition = target;
      eyePopVelocity = 0;
      eyePopSettled = true;
    }
    applyEyePopPosition(eyePopPosition);
  }

  function applyEyePopPosition(distance) {
    // The spring can overshoot internally, but the pose is constrained to the
    // authored rest-to-full-pop segment so an eye never travels through its
    // socket during the release bounce.
    const popAmount = THREE.MathUtils.clamp(
      distance / Math.max(eyePopConfig.maxDistance, Number.EPSILON),
      0,
      1,
    );
    for (const eye of eyePivots) {
      eye.positionParent.position
        .copy(eye.restPosition)
        .addScaledVector(eye.fullPopOffset, popAmount);
    }
  }

  function updateGazeTargetWorld() {
    if (eyePivots.length === 0) return;

    eyeMidpointWorld.set(0, 0, 0);
    for (const eye of eyePivots) {
      eye.pivot.getWorldPosition(eyeWorldPosition);
      eyeMidpointWorld.add(eyeWorldPosition);
    }
    eyeMidpointWorld.multiplyScalar(1 / eyePivots.length);

    const referenceEye = eyePivots[0];
    const referenceParent = referenceEye.pivot.parent;
    referenceParent.updateWorldMatrix(true, false);
    gazeCenterLocal.copy(eyeMidpointWorld);
    referenceParent.worldToLocal(gazeCenterLocal);
    gazeOffsetLocal.set(
      currentGaze.x * Math.tan(EYE_YAW_MAX) * EYE_LOCAL_GAZE_TARGET_DISTANCE,
      currentGaze.y * Math.tan(EYE_VERTICAL_LIMIT) * EYE_LOCAL_GAZE_TARGET_DISTANCE,
      EYE_LOCAL_GAZE_TARGET_DISTANCE,
    );
    // The imported eye uses local +Z as its authored forward axis. Rotating
    // this plane by the immutable rest quaternion makes it follow every head
    // parent transform without inheriting the orbiting camera's direction.
    gazeOffsetLocal.applyQuaternion(referenceEye.restLocalRotation);
    gazeTargetWorld.copy(gazeCenterLocal).add(gazeOffsetLocal);
    referenceParent.localToWorld(gazeTargetWorld);
  }

  function updateHeadViewYaw() {
    if (eyePivots.length === 0) {
      headViewYaw = 0;
      return;
    }

    const referenceEye = eyePivots[0];
    const referenceParent = referenceEye.pivot.parent;
    camera.updateWorldMatrix(true, false);
    referenceParent.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraWorldPosition);
    cameraInReferenceLocal.copy(cameraWorldPosition);
    referenceParent.worldToLocal(cameraInReferenceLocal);
    cameraDirectionInRestSpace
      .copy(cameraInReferenceLocal)
      .sub(referenceEye.pivot.position)
      .applyQuaternion(referenceEye.inverseRestLocalRotation)
      .normalize();

    // Positive camera-local X makes the face appear turned left on screen, so
    // negate it to express headViewYaw in visible head-turn screen direction:
    // negative = face left, positive = face right.
    headViewYaw = -Math.atan2(
      cameraDirectionInRestSpace.x,
      cameraDirectionInRestSpace.z,
    );
  }

  function solveEyeRotation(eye, interpolation, logDebugFrame) {
    eye.pivot.parent.updateWorldMatrix(true, false);
    eye.pivot.getWorldPosition(eyeWorldPosition);
    targetInParentLocal.copy(gazeTargetWorld);
    eye.pivot.parent.worldToLocal(targetInParentLocal);
    directionInRestSpace
      .copy(targetInParentLocal)
      .sub(eye.pivot.position)
      .applyQuaternion(eye.inverseRestLocalRotation)
      .normalize();

    const popAmount = THREE.MathUtils.clamp(
      eyePopPosition / Math.max(eyePopConfig.maxDistance, Number.EPSILON),
      0,
      1,
    );
    const popBlend = popAmount * popAmount * (3 - 2 * popAmount);
    const trackingStrength = THREE.MathUtils.lerp(
      eyePopConfig.normalTrackingStrength,
      eyePopConfig.poppedTrackingStrength,
      popBlend,
    );
    const trackingScale = trackingStrength /
      Math.max(eyePopConfig.normalTrackingStrength, Number.EPSILON);
    const maxYaw = THREE.MathUtils.lerp(
      EYE_YAW_MAX,
      eyePopConfig.poppedMaxYaw,
      popBlend,
    );
    const maxPitch = THREE.MathUtils.lerp(
      EYE_VERTICAL_LIMIT,
      eyePopConfig.poppedMaxPitch,
      popBlend,
    );
    const baseRequestedYaw = Math.atan2(
      directionInRestSpace.x,
      directionInRestSpace.z,
    ) * trackingScale;
    const headTurnFactor = THREE.MathUtils.smoothstep(
      Math.abs(headViewYaw),
      EYE_EXPANSION_START_HEAD_YAW,
      EYE_EXPANSION_FULL_HEAD_YAW,
    );
    const oppositionProduct = Math.max(0, -headViewYaw * baseRequestedYaw);
    const oppositeDirectionFactor = THREE.MathUtils.smoothstep(
      oppositionProduct,
      0,
      EYE_EXPANSION_FULL_HEAD_YAW * EYE_YAW_MAX,
    );
    const dynamicExtraYaw = EYE_OPPOSITE_YAW_EXTRA *
      headTurnFactor * oppositeDirectionFactor;
    const cursorEdgeFactor = THREE.MathUtils.smoothstep(
      Math.abs(baseRequestedYaw),
      EYE_YAW_MAX * 0.4,
      EYE_YAW_MAX,
    );
    // The face-local cursor plane deliberately preserves the original frontal
    // 18-degree mapping. Give that request matching headroom only in the
    // opposite-side case so it can actually reach the asymmetric limit.
    const requestedYaw = baseRequestedYaw +
      Math.sign(baseRequestedYaw) * dynamicExtraYaw * cursorEdgeFactor;
    let minYaw = -maxYaw;
    let maxYawAsymmetric = maxYaw;
    if (headViewYaw > 0) minYaw -= dynamicExtraYaw;
    else if (headViewYaw < 0) maxYawAsymmetric += dynamicExtraYaw;
    const yaw = THREE.MathUtils.clamp(
      requestedYaw,
      minYaw,
      maxYawAsymmetric,
    );
    const pitch = THREE.MathUtils.clamp(
      -Math.atan2(
        directionInRestSpace.y,
        Math.hypot(directionInRestSpace.x, directionInRestSpace.z),
      ) * trackingScale,
      -maxPitch,
      maxPitch,
    );

    deltaEuler.set(pitch, yaw, 0, 'YXZ');
    deltaRotation.setFromEuler(deltaEuler);
    desiredLocalRotation
      .copy(eye.restLocalRotation)
      .multiply(deltaRotation);

    if (logDebugFrame) {
      console.info('[eye-tracking/debug]', {
        eye: eye.eye.name,
        cursorWorldTarget: gazeTargetWorld.toArray(),
        eyeWorldPosition: eyeWorldPosition.toArray(),
        targetInEyeParentLocal: targetInParentLocal.toArray(),
        headViewYawDeg: THREE.MathUtils.radToDeg(headViewYaw),
        baseRequestedEyeYawDeg: THREE.MathUtils.radToDeg(baseRequestedYaw),
        requestedEyeYawDeg: THREE.MathUtils.radToDeg(requestedYaw),
        minYawDeg: THREE.MathUtils.radToDeg(minYaw),
        maxYawDeg: THREE.MathUtils.radToDeg(maxYawAsymmetric),
        dynamicExtraYawDeg: THREE.MathUtils.radToDeg(dynamicExtraYaw),
        yawDeg: THREE.MathUtils.radToDeg(yaw),
        pitchDeg: THREE.MathUtils.radToDeg(pitch),
      });
    }

    if (interpolation >= 1) {
      eye.pivot.quaternion.copy(desiredLocalRotation);
    } else {
      eye.pivot.quaternion.slerp(desiredLocalRotation, interpolation);
    }
  }

  function update(delta) {
    updateGaze(delta);
    updateEyes(delta);
  }

  function updateTargetGaze() {
    if (forcedGaze) {
      targetGaze.copy(forcedGaze);
      return true;
    }

    if (!enabled || !pointer.inside) {
      targetGaze.set(0, 0);
      return false;
    }

    targetGaze.set(
      THREE.MathUtils.clamp(pointer.ndc.x, -1, 1),
      THREE.MathUtils.clamp(pointer.ndc.y, -1, 1),
    );
    return true;
  }

  function getFollowInterpolation(delta) {
    if (EYE_FOLLOW_SMOOTHING >= 1) return 1;
    if (EYE_FOLLOW_SMOOTHING <= 0) return 0;
    return 1 - Math.pow(1 - EYE_FOLLOW_SMOOTHING, delta * 60);
  }

  return {
    gaze,
    eyePivots,
    eyePopConfig,
    setEnabled,
    setIdleMode,
    setForcedGaze,
    setEyePopHeld,
    get alignmentInputActive() {
      if (idleMode) return false;
      return Boolean(forcedGaze) || eyePopHeld || !eyePopSettled ||
        (enabled && pointer.inside);
    },
    updateGaze,
    updateEyes,
    update,
  };
}

function applyDeadZone(value, deadZone) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  return Math.sign(value) * (magnitude - deadZone) / (1 - deadZone);
}

function createEyePivot(head, definition, eyePopConfig) {
  const eye = definition.base.map((name) => head.getObjectByName(name)).find(Boolean);
  const objectName = definition.base.join(' / ');
  const cornea = definition.cornea.map((name) => head.getObjectByName(name)).find(Boolean) ?? null;

  if (!eye?.isMesh) {
    const hierarchy = [];
    head.traverse((object) => hierarchy.push(`${'  '.repeat(getDepth(object, head))}${object.name || object.type}`));
    throw new Error(`Eye mesh "${objectName}" was not found.\n${hierarchy.join('\n')}`);
  }

  eye.geometry.computeBoundingBox();
  const geometryCenter = eye.geometry.boundingBox.getCenter(new THREE.Vector3());
  const positionParent = new THREE.Object3D();
  const alignmentPivot = new THREE.Object3D();
  const pivot = new THREE.Object3D();
  const scaledCenter = geometryCenter.clone().multiply(eye.scale).applyQuaternion(eye.quaternion);

  positionParent.name = `${definition.key}_PopPosition`;
  positionParent.position.copy(eye.position).add(scaledCenter);
  alignmentPivot.name = `${definition.key}_AlignPivot`;
  alignmentPivot.position.set(0, 0, 0);
  pivot.name = `${definition.key}_TrackingPivot`;
  pivot.position.set(0, 0, 0);
  pivot.quaternion.copy(eye.quaternion);
  pivot.scale.copy(eye.scale);

  const parent = eye.parent;
  parent.add(positionParent);
  positionParent.add(alignmentPivot);
  alignmentPivot.add(pivot);
  // attach() keeps the exported world transforms intact while both eye layers
  // inherit the same gaze rotation from the base-eye pivot.
  pivot.attach(eye);
  if (cornea) pivot.attach(cornea);

  const calibration = EYE_ROTATION_OFFSETS[definition.key];
  const calibrationRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(calibration[0], calibration[1], calibration[2], 'YXZ'),
  );
  const restLocalRotation = pivot.quaternion.clone().multiply(calibrationRotation);
  const inverseRestLocalRotation = restLocalRotation.clone().invert();
  const restPosition = positionParent.position.clone();
  const outwardDirection = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(restLocalRotation)
    .normalize();
  const fullPopOffset = outwardDirection
    .clone()
    .multiplyScalar(eyePopConfig.maxDistance)
    .add(new THREE.Vector3(0, -eyePopConfig.downwardOffsetAtFullPop, 0));

  return {
    eye,
    cornea,
    positionParent,
    alignmentPivot,
    pivot,
    restPosition,
    outwardDirection,
    fullPopOffset,
    restLocalRotation,
    inverseRestLocalRotation,
  };
}

function getDepth(object, root) {
  let depth = 0;
  let current = object.parent;

  while (current && current !== root) {
    depth += 1;
    current = current.parent;
  }

  return depth;
}
