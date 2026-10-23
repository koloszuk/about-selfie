import { getPublicAssetUrl } from '../runtime/embedMode.js';

/** A composited HTML layer, not a GPU video texture. The container's existing
 * cover image remains visible until a decoded video frame is playing. */
export function createVideoBackground(container, asset, poster) {
  const video = document.createElement('video');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  const placeholderBackground = `url("${getPublicAssetUrl(poster)}")`;
  video.className = 'selfie-video-background';
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = false;
  video.preload = 'auto';
  video.poster = getPublicAssetUrl(poster);
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;pointer-events:none;opacity:0;z-index:0;';
  container.style.position = 'relative';
  container.prepend(video);

  function reveal() {
    if (!disposed && !reducedMotion.matches && !video.paused && video.readyState >= 2) {
      video.style.opacity = '1';
      container.style.backgroundImage = 'none';
    }
  }
  function onPlaying() {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
    else requestAnimationFrame(() => requestAnimationFrame(reveal));
  }
  function hide() {
    container.style.backgroundImage = placeholderBackground;
    video.style.opacity = '0';
  }
  function play() {
    if (disposed || reducedMotion.matches || document.hidden) return;
    if (!video.hasAttribute('src')) video.src = getPublicAssetUrl(asset);
    video.play()?.catch(hide);
  }
  function updatePreference() {
    if (reducedMotion.matches) {
      hide();
      video.pause();
      video.removeAttribute('src');
      video.load();
    } else play();
  }
  function visibilityChanged() {
    if (document.hidden) video.pause();
    else play();
  }
  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', hide);
  reducedMotion.addEventListener('change', updatePreference);
  document.addEventListener('visibilitychange', visibilityChanged);
  container.addEventListener('pointerdown', play, { passive: true });
  updatePreference();

  return {
    dispose() {
      disposed = true;
      reducedMotion.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', visibilityChanged);
      container.removeEventListener('pointerdown', play);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    },
  };
}
