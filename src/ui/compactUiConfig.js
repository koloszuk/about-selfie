// UI_Default/Expanded_v02 use a 209×217 artboard. Visible controls occupy
// x=14…172; all measurements below are CSS pixels before uniform scaling.
export const COMPACT_UI_CONFIG = Object.freeze({
  referenceWidth: 715,
  referenceHeight: 600,
  scaleMultiplier: 1.2, // Uniform 20% increase over UI v02.
  minScale: 0.9,
  maxScale: 1.44,
  compactBelowWidth: 520,
  touchMinScale: 1.2,
  horizontalCenter: 0.81, // Center of the first pill, relative to the viewer.
  firstControlCenterY: 0.51, // Static resting-eye-level composition anchor.
  edgeInset: 17,
  compactTopInset: 64,
  highlightReleaseMs: 450,
  wiggleSpeedMin: 0.2,
  wiggleSpeedMax: 30,
  wiggleIntensityMin: 0,
  wiggleIntensityMax: 2,
  wiggleFullRangeDragPx: 240,
});
