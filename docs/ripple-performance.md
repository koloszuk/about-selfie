# Continuous ripple performance comparison

Baseline: `5c4851d7ee03edf9df8112343b49d56e4dec9a2e`, with the explicitly requested distortion strength **65**. The complete captured tuning is in `ripple-performance-baseline.json`. No other tuning, resolution, emission, propagation, integration, video, grain, camera, or interaction settings were changed.

## Retained changes

- Cache unlit silhouette materials per original material, retaining the original map/alpha shader, side, blending, clipping, morph/skinning support and depth settings. Restore the real materials before drawing the character. Custom shader materials remain untouched; displaced materials retain their original vertex shader. Material versions invalidate the cache.
- Compile the silhouette and field programs during initialization instead of deferring their first compilation to the first drag.
- Replace four explicit contour samples with equivalent hardware bilinear filtering. Cache the simulation's spatial source band in the existing source texture's unused blue channel. Simulation samples are at those exact grid centers; temporal interpolation, pressure noise and integration are unchanged. The display retains its original contour-distance calculation.
- Store height/velocity in **RG16F**, instead of RGBA16F with two unused channels. Precision is unchanged. A framebuffer check retains RGBA16F as a compatibility fallback.
- Reuse the scene traversal callback and cached material arrays; no new production per-frame arrays, texture uploads or pixel readbacks.

The mask, source and simulation remain **256×158** at this viewer ratio. Silhouette updates remain up to **20 Hz**; integration remains **120 Hz**, with the same CFL limit and eight-step stall bound. There are still seven reusable render targets and no additional rendering passes. A capture is still head + seed + eight JFA steps + pack (11 render calls); each integration step is one fullscreen pass. The background and normal character draw share the original main render.

## Method and results

Same in-app browser, 1170×720 CSS canvas, DPR 2, 2340×1440 drawing buffer, strength 65. Assets/environment were fully loaded. Each measured interval is 12 seconds, after a warm-up (10 seconds for stationary/slow tests, three seconds for controlled rotation). GPU times use asynchronous `EXT_disjoint_timer_query_webgl2`, not CPU render-submission time. Controlled normal/fast paths repeat ±35° yaw with six-/three-second periods; these are diagnostic paths, not changes to the real automatic orbit. Stationary/slow tests suppress authored idle only within the explicit benchmark. Slow peak speed is 2°/s.

| Condition | FPS before → after | Mean frame ms before → after | Worst frame ms before → after | Ripple CPU ms before → after | GPU ms before → after |
|---|---:|---:|---:|---:|---:|
| Stationary, settled | 60.46 → 59.99 | 16.540 → 16.669 | 18.7 → 20.0 | .016 → .018 | 5.281 → 5.221 |
| Slow orbit | 60 → 60 | 16.666 → 16.666 | 25.0 → 23.5 | .012 → .011 | 5.697 → 4.884 |
| Controlled continuous rotation | 60 → 60 | 16.666 → 16.667 | 21.6 → 23.1 | .171 → .137 | 6.875 → 6.897 |
| Controlled fast rotation | 60 → 60 | 16.667 → 16.666 | 18.6 → 18.7 | .221 → .168 | 6.898 → 6.369 |
| Rotation, ripple disabled | 60 → 60 | 16.667 → 16.667 | 18.7 → 18.7 | .007 → .006 | 3.502 → 3.502 |
| Native manual rotation, 12.5 seconds | 120.02 → 120 | 8.332 → 8.333 | 14.3 → 16.3 | .132 → .108 | 3.843 → 3.774 |

Measured active-ripple CPU reduction: **19.9%** controlled normal, **24.0%** controlled fast, **18.2%** paired native manual. Total main-thread CPU in the manual pair: **1.057 → 1.018 ms** (3.7% lower). Fast GPU time was 7.7% lower; normal GPU time was essentially unchanged. Manual GPU time was only 1.8% lower, within ordinary run-to-run variance. These are single-device samples, not guaranteed speedups. FPS was refresh-limited; no FPS gain is claimed. Spikes were not consistently eliminated.

Stationary/slow differences should not be attributed to active-simulation optimization: both finish with zero feedback steps and no emissions. Native input automation and browser activation caused highly variable cadence in early tests (including low-FPS samples). Those early and incompletely loaded samples were discarded rather than compared as a claimed improvement. Final manual runs used 129/130 alternating 200 CSS-pixel drags over 12.5 seconds; the repeatable camera paths provide the cleaner A/B comparison.

Renderer-wide profiling includes offscreen work, unlike the ordinary main-render draw-call counter. Fast averages were **110.63 → 110.51 draw calls** and **6.21 → 6.19 render calls per displayed frame**; differences are capture scheduling, not removed passes. Stationary/slow use one main render and 85 calls; disabled uses one render and 84 calls. Video composition remains the same fullscreen background draw; grain remains the same 10 Hz canvas texture update.

Texture-storage estimate (excluding mask depth, driver padding, the character, video and environment): **2,103,296 → 1,779,712 bytes**, 15.4% lower. The two feedback textures alone are 50% smaller. No allocation of new targets occurs per frame.

## Visual/interaction checks

Strength 65, source density, continuous wake, immediate near-head gain, propagation, dissipation and response to reversing/fast movement were retained. No stepping or silhouette-detail loss was observed in sustained rotation. The GPU mask comparison reported **zero differing contour-coverage pixels** at the original alpha threshold; some captures had one differing alpha byte, which did not change the silhouette mask. Cached band quantization error is below .0005 (half-float precision). Tests retain equal 30/60/120 FPS integration, continuous forcing, smooth stop, idle/camera composition, CFL safety and bounded reset/stall behavior.

No production CPU/GPU readback was added. The explicit `rippleMaskCompare=1` diagnostic performs one comparison only and is off by default. Existing missing optional hair RGB-repair PNG warnings and Blender mask-count/idle-loop warnings were present in the baseline; their embedded-texture fallback and unrelated systems were not changed.

Rejected experiments: removing target clears, merging the final JFA copy, and an extra gradient-cache pass did not produce a reliable benefit. They are not in the production path. Resolution/frequency reductions were not adopted. The full-resolution video/head composition and periodic silhouette/JFA work remain possible future GPU targets; mobile hardware and sustained thermal behavior were not benchmarked.

## Reproducing the diagnostics

Use `?embed=1&rippleProfile=1` to show the opt-in 12-second profiler. It refreshes its text at 2 Hz and does nothing in an ordinary URL. GPU queries are asynchronous and pooled. Add `gpuTiming=0` to omit them, or `gpuScope=source`, `simulation`, or `ripple` to time one stage instead of the complete frame.

For a repeatable test add `rippleBenchmark=1`, `fast`, `slow`, or `stationary`. Add `rippleReference=1` for the pre-optimization algorithm at the same strength 65. The diagnostic camera driver exists only during an explicitly started benchmark; normal auto-orbit/manual behavior is otherwise untouched. Do not include benchmark flags in the Cargo iframe.
