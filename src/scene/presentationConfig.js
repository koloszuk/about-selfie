// Presentation only: camera framing does not change the model's scale.
export const PRESENTATION_CONFIG = Object.freeze({
  // Version is the first 12 characters of the image's SHA-256. Update when
  // replacing the PNG so cached images refresh without disabling caching.
  backgroundAsset: 'BG/BG_placeholder_v01.png?v=7d2dfcb04b14',
  autoOrbit: Object.freeze({
    initialHorizontalDeg: 35, // Positive means the face points screen-right.
    initialPitchDeg: -2.5, // Camera elevation: 4° below the previous +1.5°,
    // giving a subtle chin lift without changing the head/idle transforms.
    leftLimitDeg: -45,
    rightLimitDeg: 45,
    maxSpeedDegPerSecond: 2,
    limitEasing: 'cosine', // Zero velocity and smooth reversal at both ends.
    pauseTransitionSeconds: 0.35,
    resumeTransitionSeconds: 0.8,
  }),
  camera: Object.freeze({
    focalLengthMm: 50,
    distanceMultiplier: 1, // > 1 pulls back; < 1 moves closer.
    horizontalCenter: 0.46, // Fraction of the viewer width.
    verticalCenter: 0.48, // Fraction of the viewer height, measured from top.
    yawDeg: 8, // Small initial three-quarter view; orbit remains unrestricted.
    pitchDeg: 1.5,
    desktopHeightFraction: 0.90,
    narrowHeightFraction: 0.86,
    narrowAspect: 0.85,
    maximumWidthFraction: 0.92, // Pull back before portrait views clip the face.
  }),
});
