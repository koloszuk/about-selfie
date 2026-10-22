import * as THREE from 'three';

export const DEFAULT_DEFORMATION_MODE = 'hold';
export const RELEASE_SPRING_STIFFNESS = 500;
export const RELEASE_SPRING_DAMPING = 10;
export const RELEASE_SPRING_MASS = 1;
export const RELEASE_IMPULSE = 4;
export const RELEASE_OVERSHOOT_TARGET = 0.5;
export const RELEASE_MAX_OVERSHOOT_MULTIPLIER = 0.6;
export const RELEASE_SETTLE_EPSILON = 0.0005;
export const RELEASE_MAX_DELTA_TIME = 1 / 30;
export const ENABLE_DEFORMATION_RANGE_TUNING_UI = true;
export const DEFORMATION_LIMITS_LOCKED = false;
export const ENABLE_DEFORMATION_LIMITS_LOCAL_STORAGE = true;
export const DEPTH_DRAG_UNITS_PER_PIXEL = 0.08;
// Visibility is deliberately broader than interaction. Distances are CSS px.
export const HANDLE_VISIBILITY_RADIUS_MULTIPLIER = 3.0;
export const WEIGHT_REMAP_MODE = 'linear';
export const WEIGHT_GAMMA = 1.0;
export const WEIGHT_GAIN = 1.0;
export const USE_STRICT_AUTHORED_MASKS = true;
export const WEIGHT_EPSILON = 0.000001;
export const WIGGLE_DEFAULT_SPEED = 5;
export const WIGGLE_DEFAULT_INTENSITY = 0.7;
export const WIGGLE_SPRING_STIFFNESS = 90;
export const WIGGLE_SPRING_DAMPING = 12;
export const WIGGLE_SPRING_MASS = 1;
// Speed 5 preserves the original procedural phase rate. The slider maps to a
// visually safe phase rate rather than allowing 30 Hz motion at its maximum.
export const WIGGLE_REFERENCE_SPEED = 5;
export const WIGGLE_MAX_FREQUENCY_HZ = 3;
export const WIGGLE_MAX_PHASE_SPEED = 12;
export const WIGGLE_SPEED_CURVE_EXPONENT = 0.49;
export const WIGGLE_MIN_STIFFNESS_MULTIPLIER = 0.5;
export const WIGGLE_MAX_STIFFNESS_MULTIPLIER = 6;
export const WIGGLE_MIN_DAMPING_MULTIPLIER = 0.7;
export const WIGGLE_MAX_DAMPING_MULTIPLIER = 2.5;
export const WIGGLE_DIRECT_FOLLOW_START_SPEED = 8;
export const WIGGLE_DIRECT_FOLLOW_FULL_SPEED = 30;
export const WIGGLE_MAX_DIRECT_FOLLOW_BLEND = 0.35;
export const WIGGLE_MAX_SUBSTEP_SECONDS = 1 / 120;
export const WIGGLE_FADE_DURATION = 0.4;
export const WIGGLE_CONTROL_RESTORE_DURATION = 0.3;
export const WIGGLE_DRAG_RESUME_SECONDS = 0.3;
export const WIGGLE_BOUNDARY_MARGIN = 0.05;
export const WIGGLE_RANGE_ADAPT_SECONDS = 0.2;
export const WIGGLE_MAX_RANGE_FRACTION = 0.45;

// Keyboard Mode uses the same imported PICK_* anchors, authored mask lists,
// asymmetric limits, and deformation composition as pointer dragging. Keep the
// mapping here so changing a key never requires touching interaction code.
export const KEYBOARD_MODE_CONFIG = Object.freeze({
  enabledByDefault: false,
  keyToPickName: Object.freeze({
    D: 'PICK_Nose',
    A: 'PICK_CheekRight',
    N: 'PICK_EarLeft',
    I: 'PICK_EarRight',
    E: 'PICK_EyebrowLeft',
    L: 'PICK_EyebrowRight',
    R: 'PICK_MouthLeft',
    O: 'PICK_MouthRight',
    G: 'PICK_MouthCenter',
    U: 'PICK_Chin',
    S: 'PICK_CheekLeft',
    B: 'PICK_Forehead',
    T: 'PICK_Bridge',
  }),
  // A brief attack makes a keyboard hit feel immediate before its independent
  // spring returns it to the pose that existed before the key press.
  attackSpeed: 72,
  attackDurationSeconds: 0.055,
  springStiffness: 520,
  springDamping: 11,
  springMass: 1,
  springImpulse: 3.5,
  maxOvershootMultiplier: 0.45,
  settleEpsilon: 0.0005,
  highlightDurationMs: 180,
  distortionMultiplierDefault: 1.75,
  distortionMultiplierMin: 0.25,
  distortionMultiplierMax: 3,
  distortionMultiplierStep: 0.05,
});

export function remapWeight(weight) {
  // Preserve Blender's authored mask values directly. The tiny epsilon is
  // applied only when building compact influence lists to omit float noise.
  return THREE.MathUtils.clamp(weight, 0, 1);
}

const BLUE = 0x4a9bff;

// PICK_* empties provide handle centers. Manual deformation weights come only
// from the strict Blender-authored attributes named below. The region radii are
// visual-debug metadata and never generate or expand a deformation mask.
export const DEFORMATION_CONTROL_CONFIGS = [
  control(
    'nose', 'Nose', 'PICK_Nose', '_CTRL_Nose',
    [30, 30, 30], { minZ: 40 }, 15, [1, 1, 1], 1, 48, [1, 1, 1],
    wiggle([0.55, 0.45, 0.85], [0, 0.55, 1.05], [0.82, 1.03, 1.24]),
  ),
  control(
    'earLeft', 'Ear Left', 'PICK_EarLeft', '_CTRL_EarLeft',
    [12, 18, 18], { minX: 32 }, 12, [1, 1, 1], 0.9, 42, [1, 1, 1],
    wiggle([0.9, 0.75, 0.55], [0.15, 1.2, 2.1], [0.78, 1.02, 1.2]),
  ),
  control(
    'earRight', 'Ear Right', 'PICK_EarRight', '_CTRL_EarRight',
    [12, 18, 18], { maxX: -32 }, 12, [1, 1, 1], 0.9, 42, [1, 1, 1],
    wiggle([0.9, 0.75, 0.55], [3.29, 4.34, 5.24], [0.78, 1.02, 1.2]),
  ),
  control(
    'eyebrowLeft', 'Eyebrow Left', 'PICK_EyebrowLeft', '_CTRL_EyebrowLeft',
    [18, 13, 13], { minX: 2, minY: -8, maxY: 20, minZ: 48 },
    6, [0.08, 1, 0.05], 0.8, 38, [1, 1, 1],
    wiggle([0.3, 0.85, 0.12], [0.4, 0.9, 1.6], [0.9, 1.18, 1.31]),
  ),
  control(
    'eyebrowRight', 'Eyebrow Right', 'PICK_EyebrowRight', '_CTRL_EyebrowRight',
    [18, 13, 13], { maxX: -2, minY: -8, maxY: 20, minZ: 48 },
    6, [0.08, 1, 0.05], 0.8, 38, [1, 1, 1],
    wiggle([0.3, 0.85, 0.12], [3.54, 4.04, 4.74], [0.9, 1.18, 1.31]),
  ),
  control(
    'mouthLeft', 'Mouth Left', 'PICK_MouthLeft', '_CTRL_MouthLeft',
    [13, 11, 12], { minX: 2, minY: -60, maxY: -37, minZ: 48 },
    10, [1, 1, 0.15], 1, 38, [1, 1, 0.15],
    wiggle([0.7, 0.65, 0.25], [0.75, 1.45, 2.25], [0.86, 1.08, 1.27]),
  ),
  control(
    'mouthRight', 'Mouth Right', 'PICK_MouthRight', '_CTRL_MouthRight',
    [13, 11, 12], { maxX: -2, minY: -60, maxY: -37, minZ: 48 },
    10, [1, 1, 0.15], 1, 38, [1, 1, 0.15],
    wiggle([0.7, 0.65, 0.25], [3.89, 4.59, 5.39], [0.86, 1.08, 1.27]),
  ),
  control(
    'mouthCenter', 'Mouth Center', 'PICK_MouthCenter', '_CTRL_MouthCenter',
    [14, 13, 12], { minY: -60, maxY: -35, minZ: 48 },
    10, [0.7, 1, 0.5], 1, 38, [1, 1, 1],
    wiggle([0.55, 0.8, 0.35], [2.15, 3.05, 4.2], [0.91, 1.14, 1.33]),
    { minZ: -2, maxZ: 5 },
  ),
  control(
    'chin', 'Chin', 'PICK_Chin', '_CTRL_Chin',
    [28, 18, 22], { maxY: -55, minZ: 25 }, 13, [0.6, 1, 0.15], 0.9, 42, [1, 1, 1],
    wiggle([0.5, 0.85, 0.2], [1.1, 2.05, 2.75], [0.8, 1.12, 1.23]),
  ),
  control(
    'cheekLeft', 'Cheek Left', 'PICK_CheekLeft', '_CTRL_CheekLeft',
    [18, 18, 15], {}, 8, [1, 1, 0.5], 0.9, 42, [1, 1, 1],
    wiggle([0.45, 0.5, 0.75], [0.25, 1.65, 2.4], [0.84, 1.01, 1.19]),
  ),
  control(
    'cheekRight', 'Cheek Right', 'PICK_CheekRight', '_CTRL_CheekRight',
    [18, 18, 15], {}, 8, [1, 1, 0.5], 0.9, 42, [1, 1, 1],
    wiggle([0.45, 0.5, 0.75], [3.39, 4.79, 5.54], [0.84, 1.01, 1.19]),
  ),
  control(
    'forehead', 'Forehead', 'PICK_Forehead', '_CTRL_Forehead',
    [22, 18, 12], {}, 8, [0.75, 1, 0.25], 0.85, 42, [1, 1, 1],
    wiggle([0.25, 0.7, 0.18], [1.45, 2.35, 3.15], [0.76, 1.06, 1.22]),
  ),
  control(
    'bridge', 'Bridge', 'PICK_Bridge', '_CTRL_Bridge',
    [16, 16, 12], {}, 10, [0.7, 0.7, 1], 0.9, 42, [1, 1, 1],
    wiggle([0.3, 0.45, 0.45], [0.3, 0.85, 1.3], [0.8, 1.0, 1.21]),
    { minZ: -4, maxZ: 10 },
  ),
];

function control(
  id, label, pickName, maskName, radii, bounds, maxDisplacement,
  axisScale, strength, hoverRadiusPx, dragSensitivity, wiggleProfile, directionalLimits = {},
) {
  const limits = {
    minX: -maxDisplacement * axisScale[0],
    maxX: maxDisplacement * axisScale[0],
    minY: -maxDisplacement * axisScale[1],
    maxY: maxDisplacement * axisScale[1],
    minZ: -maxDisplacement * axisScale[2],
    maxZ: maxDisplacement * axisScale[2],
    ...directionalLimits,
  };
  return {
    id,
    label,
    pickName,
    maskName,
    debugRegionRadii: new THREE.Vector3(...radii),
    debugRegionBounds: bounds,
    maxDisplacement,
    axisScale: new THREE.Vector3(...axisScale),
    // Range extents and input response are intentionally independent. These
    // values multiply the world→head-local drag delta before ellipsoid clamp.
    dragSensitivity: new THREE.Vector3(...dragSensitivity),
    strength,
    handleColor: BLUE,
    // `hoverRadiusPx` remains the original clickable/grabbable distance.
    grabRadiusPx: hoverRadiusPx,
    visibilityRadiusPx: hoverRadiusPx * HANDLE_VISIBILITY_RADIUS_MULTIPLIER,
    limits,
    wiggle: wiggleProfile,
  };
}

function wiggle(amplitude, phase, frequency) {
  return {
    amplitude: new THREE.Vector3(...amplitude),
    phase: new THREE.Vector3(...phase),
    frequency: new THREE.Vector3(...frequency),
  };
}
