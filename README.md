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
iframe variant. Its transparent WebGL canvas sits over the viewer's own video,
placeholder and grain layers, keeps rendering responsive to the iframe size, and focuses
the canvas after the first pointer interaction for keyboard controls.

```html
<iframe
  src="https://koloszuk.github.io/about-selfie/?embed=1"
  title="Interactive About Selfie"
  loading="lazy"
  allow="autoplay; fullscreen"
  style="display:block;width:100%;height:auto;aspect-ratio:772 / 475;min-height:0;border:0;background:transparent;"
></iframe>
```

```css
iframe[src*="about-selfie"] {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 772 / 475;
  min-height: 0;
  border: 0;
  background: transparent;
}
```

Replace Cargo's existing inline `height: 600px` with `height: auto` and
`aspect-ratio: 772 / 475`; a stylesheet cannot override that inline height
without `!important`. At 772px wide the iframe is 475px high; at 733.5px it is
451.31px high. Do not retain a minimum-height rule. The viewer fits this ratio
inside available viewport dimensions, so a differently shaped iframe will have
unused space around it until its outer height is corrected in Cargo.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` builds and
publishes automatically for every push to `main`. After creating an empty
GitHub repository named `about-selfie`, push this directory to its `main`
branch, then set **Settings → Pages → Source** to **GitHub Actions**.

The resulting URL is:

`https://YOUR-GITHUB-USERNAME.github.io/about-selfie/?embed=1`
