// Presentation only: camera framing does not change the model's scale.
export const PRESENTATION_CONFIG = Object.freeze({
  viewer: Object.freeze({ width: 772, height: 475 }), // Responsive proportion, not pixel dimensions.
  // Replace this pair together; placeholder is the video's exact first frame.
  // Content-hash versions refresh only changed assets, not caching globally.
  background: Object.freeze({
    videoAsset: 'BG/AboutSelfie_AnimatedBG_v02_halfSpeed.mp4?v=f51377e1e5e4',
    placeholderAsset: 'BG/AboutSelfie_AnimatedBG_v02_halfSpeed_firstFrame.webp?v=44b78acfa945',
  }),
  backgroundGrain: Object.freeze({
    enabled: true,
    opacity: 0.08,
    size: 1, // Noise pixel size; resolution is capped for mobile performance.
    fps: 10,
  }),
  backgroundRipple: Object.freeze({
    enabled: true,
    intervalSeconds: 5,
    durationSeconds: 4,
    startInsetPx: 25,
    intensityEaseInSeconds: 0.6,
    strengthPx: 24,
    expansionPx: 180,
    softnessPx: 24,
    easing: 3,
    referenceHeight: 475, // Pixel settings scale proportionally with the viewer.
    maskResolution: 256, // Long edge; captured only once per ripple.
  }),
  autoOrbit: Object.freeze({
    initialHorizontalDeg: 35, // Positive means the face points screen-right.
    initialPitchDeg: -2.5, // Camera elevation: 4° below the previous +1.5°,
    // giving a subtle chin lift without changing the head/idle transforms.
    leftLimitDeg: -35,
    rightLimitDeg: 35,
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
