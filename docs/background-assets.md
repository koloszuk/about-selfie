# Replacing the background

Keep the active pair in `PRESENTATION_CONFIG.background` in
`src/scene/presentationConfig.js`. Never reuse an older poster with a new video.

1. Inspect the new video. Preserve its aspect ratio and frame rate; do not
   transcode a compatible H.264 MP4 unnecessarily.
2. Extract the exact time-zero frame using `scripts/extract-background-frame.swift`
   (macOS AVFoundation). Compile it with the installed Swift compiler and SDK,
   then run `extract-background-frame input.mp4 output.png`.
3. Optionally encode that PNG as lossless WebP with its original ICC profile.
   Verify that decoded RGB pixels are identical to the extracted PNG.
4. Put the MP4 and matching still in `public/BG/`. Set the two config URLs with
   their SHA-256 prefixes as `?v=` values. Build and publish both assets before
   activating the updated pair through the existing Pages workflow.
5. Verify both production URLs, actual video playback, reduced-motion/static
   fallback, and the Cargo iframe. Do not change grain or camera configuration.

The still uses the same centered cover layout as the video. It remains visible
until a decoded video frame is playing, returns if playback fails, and is the
only background requested when reduced motion is preferred. The existing grain
layer is independent and remains above both background states.
