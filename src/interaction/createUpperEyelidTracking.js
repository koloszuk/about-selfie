import * as THREE from 'three';

export const UPPER_EYELID_TRACKING_DEFAULTS = Object.freeze({
  enabled: true,
  downwardFollowStrength: 0.45,
  downwardFollowRange: 12, // Degrees of actual downward eye rotation.
  movementSmoothing: 0.045, // Exponential response time, in seconds; 0 is immediate.
});

// Reuse the authored half-close displacement, not a procedural lid translation.
// Fail closed on a different export whose upper/lower clusters are ambiguous.
export function isolateUpperEyelid(geometry, morphIndex, blinkIndex) {
  if (!geometry.morphTargetsRelative) throw new Error('Relative eyelid morphs are required.');
  const position = geometry.attributes.position;
  const shape = geometry.morphAttributes.position?.[morphIndex];
  const blink = geometry.morphAttributes.position?.[blinkIndex];
  if (!shape || !blink) throw new Error('Authored half-close and blink shapes are required.');
  const indices = [], offsets = [];
  let upperMinY = Infinity, lowerMaxY = -Infinity, lowerCount = 0;
  for (let i = 0; i < position.count; i += 1) {
    const dy = shape.getY(i);
    if (Math.hypot(shape.getX(i), dy, shape.getZ(i)) <= 0.00001) continue;
    if (dy < -0.00001 && blink.getY(i) < -0.00001) {
      indices.push(i);
      offsets.push(shape.getX(i), dy, shape.getZ(i));
      upperMinY = Math.min(upperMinY, position.getY(i));
    } else if (dy > 0.00001 && blink.getY(i) > 0.00001) {
      lowerCount += 1;
      lowerMaxY = Math.max(lowerMaxY, position.getY(i));
    } else {
      throw new Error('Half-close/blink displacements do not identify matching lid groups.');
    }
  }
  if (!indices.length || !lowerCount || upperMinY <= lowerMaxY) {
    throw new Error('Upper/lower eyelid groups are not spatially separable in this export.');
  }
  return {
    indices: Uint32Array.from(indices),
    offsets: Float32Array.from(offsets),
    lowerCount,
    separation: upperMinY - lowerMaxY,
  };
}

export function updateUpperLidAmount(current, downwardRadians, delta, config) {
  const target = config.enabled
    ? THREE.MathUtils.clamp(downwardRadians / THREE.MathUtils.degToRad(
      Math.max(config.downwardFollowRange, 0.01)), 0, 1) * config.downwardFollowStrength
    : 0;
  const blend = config.movementSmoothing > 0
    ? -Math.expm1(-Math.max(delta, 0) / config.movementSmoothing) : 1;
  return THREE.MathUtils.lerp(current, target, blend);
}

export function upperLidClosureBudget(blink, halfClose) {
  return 1 - THREE.MathUtils.clamp(blink + halfClose, 0, 1);
}

export function createUpperEyelidTracking({ deformer, eyePivots, eyeHoverClose,
  config = { ...UPPER_EYELID_TRACKING_DEFAULTS } }) {
  const mesh = deformer.mesh;
  const blinkIndex = mesh.morphTargetDictionary.Blink_center;
  const rotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const states = [];
  let error = null;
  try {
    for (const region of [eyeHoverClose.leftEye, eyeHoverClose.rightEye]) {
      const eye = eyePivots.find(entry => entry.eye === region.eye);
      if (!eye) throw new Error('Unable to match the eyelid region to its actual eyeball.');
      const isolated = isolateUpperEyelid(mesh.geometry, region.morphIndex, blinkIndex);
      eye.eye.updateWorldMatrix(true, false);
      eye.positionParent.getWorldQuaternion(parentRotation);
      eye.eye.getWorldQuaternion(rotation);
      const inverseRest = parentRotation.invert().multiply(rotation).invert().clone();
      states.push({ eye, morphIndex: region.morphIndex, ...isolated,
        inverseRest, amount: 0, downwardDegrees: 0, applied: 0 });
    }
  } catch (cause) {
    error = cause.message;
    states.length = 0;
    console.warn('[upper-eyelid-tracking] Disabled safely:', error);
  }
  console.info('[upper-eyelid-tracking] Authored upper-lid isolation:', states.map(state => ({
    eye: state.eye.eye.name,
    shape: Object.keys(mesh.morphTargetDictionary).find(
      name => mesh.morphTargetDictionary[name] === state.morphIndex),
    upperVertices: state.indices.length,
    excludedLowerVertices: state.lowerCount,
    separation: state.separation,
  })));

  function update(delta) {
    const influences = mesh.morphTargetInfluences;
    const blink = THREE.MathUtils.clamp(influences[blinkIndex] ?? 0, 0, 1);
    for (const state of states) {
      // Read the final visible eye pose, including authored idle, alignment,
      // tracking and its transitions. Remove the moving socket/head frame.
      state.eye.eye.updateWorldMatrix(true, false);
      state.eye.positionParent.getWorldQuaternion(parentRotation);
      state.eye.eye.getWorldQuaternion(rotation);
      rotation.premultiply(parentRotation.invert()).premultiply(state.inverseRest);
      direction.set(0, 0, 1).applyQuaternion(rotation).normalize();
      const downward = -Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
      state.downwardDegrees = THREE.MathUtils.radToDeg(downward);
      state.amount = updateUpperLidAmount(state.amount, downward, delta, config);
      // Share the existing closure budget rather than stacking full lid poses.
      state.applied = state.amount * upperLidClosureBudget(
        blink, influences[state.morphIndex] ?? 0);
      deformer.addVertexOffsets(state.indices, state.offsets, state.applied);
    }
  }
  return { config, states, error, update };
}
