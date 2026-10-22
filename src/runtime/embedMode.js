/**
 * Embed mode is intentionally opt-in so the standalone prototype retains its
 * current presentation. Use `?embed=1` for hosts such as Cargo.
 */
const params = new URLSearchParams(window.location.search);

export const IS_EMBED_MODE = params.get('embed') === '1';

if (IS_EMBED_MODE) document.documentElement.dataset.embedMode = 'true';

/**
 * Resolves a Vite public asset from the current deployment root. This works
 * on localhost, at a GitHub Pages project URL, and inside an iframe.
 */
export function getPublicAssetUrl(fileName) {
  const normalizedFileName = String(fileName).replace(/^\/+/, '');
  return new URL(`${import.meta.env.BASE_URL}${normalizedFileName}`, window.location.href).href;
}
