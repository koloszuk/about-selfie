import { defineConfig } from 'vite';

// A relative base keeps public assets working at both localhost and a
// GitHub Pages project URL without hard-coding the repository name.
export default defineConfig({
  base: './',
});
