/** Low-resolution monochrome noise, regenerated independently of the video.
 * One reusable pixel buffer; no tiles, full-resolution draws, or WebGL work. */
export function createBackgroundGrain(container, config) {
  const canvas = document.createElement('canvas');
  canvas.className = 'selfie-background-grain';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;mix-blend-mode:soft-light;opacity:${config.opacity};`;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context || !config.enabled) return { dispose() {} };
  container.appendChild(canvas);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pixels;
  let words;
  let timer;
  let seed = (Math.random() * 0xffffffff) >>> 0 || 1;

  function draw() {
    for (let i = 0; i < words.length; i += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const gray = seed & 255;
      words[i] = (0xff000000 | gray * 0x010101) >>> 0;
    }
    context.putImageData(pixels, 0, 0);
  }
  function resize() {
    // Cap at ~160k noise pixels, scaled to cover the viewer without repetition.
    const ratio = Math.min(1,
      512 / Math.max(container.clientWidth, 1),
      320 / Math.max(container.clientHeight, 1)) / Math.max(config.size, 0.5);
    canvas.width = Math.max(1, Math.ceil(container.clientWidth * ratio));
    canvas.height = Math.max(1, Math.ceil(container.clientHeight * ratio));
    pixels = context.createImageData(canvas.width, canvas.height);
    words = new Uint32Array(pixels.data.buffer);
    draw();
  }
  function schedule() {
    clearInterval(timer);
    // Reduced motion retains a static grain frame, not an animated overlay.
    if (!document.hidden && !reducedMotion.matches) {
      timer = setInterval(draw, 1000 / Math.max(1, config.fps));
    }
  }
  const observer = new ResizeObserver(resize);
  resize();
  observer.observe(container);
  schedule();
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
  return {
    dispose() {
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      reducedMotion.removeEventListener('change', schedule);
      canvas.remove();
    },
  };
}
