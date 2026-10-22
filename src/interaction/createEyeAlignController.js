import * as THREE from 'three';

export const EYE_ALIGN_DEFAULTS = deepFreeze({
  resting: {
    left: { x: 0, y: 0, z: 0 },
    right: { x: 0, y: 0, z: 0 },
  },
  interactive: {
    left: { x: 5.9, y: -0.4, z: 0 },
    right: { x: 0, y: 5.8, z: 0 },
  },
  idle: {
    left: { x: 0, y: 0, z: 0 },
    right: { x: -3.8, y: 6.8, z: 0 },
  },
});

export const EYE_ALIGN_INTERACTION_BLEND_SECONDS = 0.12;

// Version 4 installs the tuned three-state defaults. Only older Eye Align
// overrides are invalidated; unrelated Advanced Settings storage is untouched.
const EYE_ALIGN_STORAGE_KEY = 'about-selfie:eye-align-browser-override:v4';
const LEGACY_EYE_ALIGN_STORAGE_KEYS = Object.freeze([
  'about-selfie:eye-align-browser-override:v1',
  'about-selfie:eye-align-browser-override:v2',
  'about-selfie:eye-align-browser-override:v3',
]);

// Degree values are intentionally mutable for live tuning. Paste copied
// values into EYE_ALIGN_DEFAULTS to make a tuning pass permanent.
export const eyeAlign = loadEyeAlignBrowserOverride();

export function saveEyeAlignBrowserOverride(config) {
  try {
    localStorage.setItem(EYE_ALIGN_STORAGE_KEY, JSON.stringify(cloneConfig(config)));
    return true;
  } catch (error) {
    console.warn('[eye-align] Could not save browser override.', error);
    return false;
  }
}

export function clearEyeAlignBrowserOverride() {
  try {
    localStorage.removeItem(EYE_ALIGN_STORAGE_KEY);
    clearLegacyEyeAlignBrowserOverrides();
  } catch (error) {
    console.warn('[eye-align] Could not clear browser override.', error);
  }
}

function loadEyeAlignBrowserOverride() {
  if (typeof localStorage === 'undefined') return cloneConfig(EYE_ALIGN_DEFAULTS);
  try {
    clearLegacyEyeAlignBrowserOverrides();
    const saved = localStorage.getItem(EYE_ALIGN_STORAGE_KEY);
    return saved
      ? sanitizeEyeAlignConfig(JSON.parse(saved))
      : cloneConfig(EYE_ALIGN_DEFAULTS);
  } catch (error) {
    console.warn('[eye-align] Invalid browser override; using code defaults.', error);
    return cloneConfig(EYE_ALIGN_DEFAULTS);
  }
}

function clearLegacyEyeAlignBrowserOverrides() {
  for (const key of LEGACY_EYE_ALIGN_STORAGE_KEYS) localStorage.removeItem(key);
}

function sanitizeEyeAlignConfig(source) {
  const result = cloneConfig(EYE_ALIGN_DEFAULTS);
  for (const mode of ['resting', 'interactive', 'idle']) {
    for (const side of ['left', 'right']) {
      for (const axis of ['x', 'y', 'z']) {
        const value = Number(source?.[mode]?.[side]?.[axis]);
        if (Number.isFinite(value)) result[mode][side][axis] = value;
      }
    }
  }
  return result;
}

export function createEyeAlignController({
  eyePivots,
  config = eyeAlign,
  defaults = EYE_ALIGN_DEFAULTS,
}) {
  const states = eyePivots.map((eye) => ({
    eye,
    side: resolveSide(eye.eye.name),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    restingOffset: new THREE.Quaternion(),
    interactiveOffset: new THREE.Quaternion(),
    idleOffset: new THREE.Quaternion(),
    activeOffset: new THREE.Quaternion(),
    blendedOffset: new THREE.Quaternion(),
    returnStartOffset: new THREE.Quaternion(),
    inverseRestLocalRotation: eye.restLocalRotation.clone().invert(),
  }));
  let interactionBlend = 0;
  let interactionWasActive = false;
  let returnTransitionActive = false;
  let returnTransitionProgress = 1;

  const mapping = states.map((state) => ({
    importedNode: state.eye.eye.name,
    importedRotationOrder: state.eye.eye.rotation.order,
    proceduralNode: state.eye.pivot.name,
    proceduralRotationOrder: state.eye.pivot.rotation.order,
    alignmentNode: state.eye.alignmentPivot.name,
    side: state.side,
    composition: 'alignment parent * procedural pivot * mixer-owned imported eye',
  }));
  console.info('[eye-align] Quaternion correction layers:', mapping);
  console.info('[eye-align] Exact eye mapping:', JSON.stringify(mapping));

  function prepareInteractionTransition({ interactionActive = false, idleBlend = 0 } = {}) {
    const active = Boolean(interactionActive);
    const idleWeight = THREE.MathUtils.clamp(idleBlend, 0, 1);

    if (interactionWasActive && !active && idleWeight <= 0.0001) {
      for (const state of states) {
        // Preserve the exact visible orientation while moving the procedural
        // tracking pivot back to rest. With the pivot fixed after this rebase,
        // the alignment parent can follow one direct quaternion path to the
        // configured Resting correction instead of exposing an intermediate
        // "Interactive correction + centered tracking" pose.
        state.returnStartOffset
          .copy(state.eye.alignmentPivot.quaternion)
          .multiply(state.eye.pivot.quaternion)
          .multiply(state.inverseRestLocalRotation)
          .normalize();
        state.eye.pivot.quaternion.copy(state.eye.restLocalRotation);
      }
      interactionBlend = 0;
      returnTransitionProgress = 0;
      returnTransitionActive = true;
    } else if (active) {
      returnTransitionActive = false;
      returnTransitionProgress = 1;
    }

    interactionWasActive = active;
  }

  function update({ idleBlend = 0, interactionActive = false, deltaTime = 0 } = {}) {
    const idleWeight = THREE.MathUtils.clamp(idleBlend, 0, 1);
    const transitionStep = EYE_ALIGN_INTERACTION_BLEND_SECONDS > 0
      ? Math.max(deltaTime, 0) / EYE_ALIGN_INTERACTION_BLEND_SECONDS
      : 1;
    if (returnTransitionActive) {
      returnTransitionProgress = moveTowards(
        returnTransitionProgress,
        1,
        transitionStep,
      );
    } else {
      interactionBlend = moveTowards(
        interactionBlend,
        interactionActive ? 1 : 0,
        transitionStep,
      );
    }
    for (const state of states) {
      setOffsetQuaternion(
        state.restingOffset,
        state.euler,
        config.resting[state.side],
      );
      setOffsetQuaternion(
        state.interactiveOffset,
        state.euler,
        config.interactive[state.side],
      );
      setOffsetQuaternion(
        state.idleOffset,
        state.euler,
        config.idle[state.side],
      );
      if (returnTransitionActive) {
        state.activeOffset
          .copy(state.returnStartOffset)
          .slerp(state.restingOffset, returnTransitionProgress)
          .normalize();
        // Keep the procedural layer fixed so the total visible rotation is
        // exactly returnStart → slerp → Resting, with no competing eye return.
        state.eye.pivot.quaternion.copy(state.eye.restLocalRotation);
      } else {
        state.activeOffset
          .copy(state.restingOffset)
          .slerp(state.interactiveOffset, interactionBlend)
          .normalize();
      }
      state.blendedOffset
        .copy(state.activeOffset)
        .slerp(state.idleOffset, idleWeight)
        .normalize();

      // This parent is never targeted by AnimationMixer or eye tracking. Its
      // absolute quaternion is reconstructed once per frame, so the correction
      // cannot feed back into the authored or procedural source rotations.
      state.eye.alignmentPivot.quaternion.copy(state.blendedOffset);
    }
    if (returnTransitionActive && returnTransitionProgress >= 1) {
      returnTransitionActive = false;
    }
  }

  function reset() {
    copyConfig(defaults, config);
  }

  return {
    config,
    defaults,
    states,
    get interactionBlend() { return interactionBlend; },
    get returnTransitionActive() { return returnTransitionActive; },
    prepareInteractionTransition,
    update,
    reset,
  };
}

function setOffsetQuaternion(quaternion, euler, values) {
  euler.set(
    THREE.MathUtils.degToRad(values.x),
    THREE.MathUtils.degToRad(values.y),
    THREE.MathUtils.degToRad(values.z),
    'YXZ',
  );
  quaternion.setFromEuler(euler).normalize();
}

function resolveSide(name) {
  if (/left/i.test(name)) return 'left';
  if (/right/i.test(name)) return 'right';
  throw new Error(`[eye-align] Unable to resolve eye side from "${name}".`);
}

function cloneConfig(source) {
  return {
    resting: {
      left: { ...source.resting.left },
      right: { ...source.resting.right },
    },
    interactive: {
      left: { ...source.interactive.left },
      right: { ...source.interactive.right },
    },
    idle: {
      left: { ...source.idle.left },
      right: { ...source.idle.right },
    },
  };
}

function copyConfig(source, destination) {
  for (const mode of ['resting', 'interactive', 'idle']) {
    for (const side of ['left', 'right']) {
      Object.assign(destination[mode][side], source[mode][side]);
    }
  }
}

function moveTowards(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}
