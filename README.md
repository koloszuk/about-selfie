# About Selfie

Interactive Three.js head prototype built with Vite and Three.js.

## Local development

```bash
pnpm install
pnpm dev
pnpm build
```

## Cargo iframe

The standalone build keeps its usual interface. Add `?embed=1` for the
transparent iframe variant. It uses the host page behind the transparent
WebGL canvas, keeps its rendering responsive to the iframe size, and focuses
the canvas after the first pointer interaction for keyboard controls.

```html
<iframe
  src="https://YOUR-GITHUB-USERNAME.github.io/about-selfie/?embed=1"
  title="Interactive About Selfie"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

```css
iframe[src*="about-selfie"] {
  display: block;
  width: 100%;
  height: min(600px, 80vw);
  min-height: 420px;
  border: 0;
  background: transparent;
}
```

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` builds and
publishes automatically for every push to `main`. After creating an empty
GitHub repository named `about-selfie`, push this directory to its `main`
branch, then set **Settings → Pages → Source** to **GitHub Actions**.

The resulting URL is:

`https://YOUR-GITHUB-USERNAME.github.io/about-selfie/?embed=1`
