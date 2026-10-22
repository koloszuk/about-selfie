# Project delivery

After implementing and validating changes, publish them through the existing
`origin` repository (`https://github.com/koloszuk/about-selfie.git`) on `main`.
The `.github/workflows/deploy-pages.yml` workflow is the existing hosting path.
Commit and push without force-pushing or overwriting remote history. Check the
GitHub Actions deployment and the public GitHub Pages viewer after publishing.
Do not modify Cargo content or introduce another host unless explicitly asked.

Report local implementation, build, deployment, and live verification as
separate outcomes. If access or credentials block publishing, report the
blocker and do not describe the live website as updated. Cargo may require
authenticated access; report when its iframe cannot be verified directly.
