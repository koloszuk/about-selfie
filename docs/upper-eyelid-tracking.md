# Upper eyelid tracking

Defaults live in `UPPER_EYELID_TRACKING_DEFAULTS` in
`src/interaction/createUpperEyelidTracking.js`: enabled, strength 0.45 of the
authored half-close upper-lid displacement, full response at 12 degrees down,
exponential smoothing time 0.045 seconds. Advanced Settings exposes those four
values; changes are live and do not alter Eye Align or eye-tracking limits.

## Asset inspection and isolation

The current GLB has only `Blink_center`, `EyeRight_HalfClose`, and
`EyeLeft_HalfClose`; there are no upper-lid-only targets or eyelid mask attributes.
The existing hover system's verified export mapping is retained:

| Eyeball object | Authored shape | Upper vertices | Excluded lower vertices |
| --- | --- | --- | --- |
| `Eye_Left` (negative model X) | `EyeRight_HalfClose` | 20 | 11 |
| `Eye_Right` (positive model X) | `EyeLeft_HalfClose` | 19 | 11 |

Upper vertices have downward displacement in both the half-close and full-blink
shapes; lower vertices have upward displacement in both. Their rest-position Y
groups are separated by 3.239681 imported units. Reuse the complete XYZ authored
deltas of the upper group, with their existing boundary falloff, not an invented
translation or reduced full blink. All other position deltas remain exactly zero.
Initialization refuses an export with missing or ambiguous groups rather than
silently falling back to a broad positional mask. Such an export needs dedicated
Blender `EyeLeft_UpperLidDown` / `EyeRight_UpperLidDown` shapes or authored masks.

## Update and composition

After the final procedural/idle/alignment eye pose, read the actual eyeball world
quaternion, remove its socket-parent world quaternion, then remove the immutable
rest orientation. Rotate the rest +Z forward vector and derive downward pitch
from `-atan2(y, hypot(x,z))`. This includes authored idle and Eye Align while
excluding global head/camera motion. Upward pitch produces zero new closure.

The smoothed follow amount is multiplied by
`1 - clamp(Blink_center + correspondingHalfClose, 0, 1)`. Thus full blink or
half-close owns the lid exclusively, with continuous restoration on reopening.
No existing morph weight or animation timing is rewritten.

Compact authored deltas enter the existing CPU deformation accumulator; its
normal recomputation remains the only normal-update path. Commit and hair surface
binding occur after the contribution. Do not append generated morph slots to the
mixer-owned influence array: Three.js's whole-array animation binding writes the
destination array length, whereas the GLB animation tracks contain three values.

## Checks

`node scripts/test-upper-eyelid-tracking.mjs` decodes the real sparse GLB morphs.
It checks side mapping, exact exclusion of lower lids/brows/other vertices,
neutral/up/down/diagonal gaze, rotated heads, final alignment and authored eye
rotation, blink/squint budget, no cumulative offsets, 30/120 Hz equivalence, and
safe rejection of ambiguous geometry. Existing keyboard and ripple regressions
also pass. Browser spot checks cover live settings, downward gaze and blink.
No source GLB or other animation/control defaults are modified.
