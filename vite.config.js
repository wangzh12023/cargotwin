import { defineConfig } from 'vite';

// `base: './'` makes the build work from any sub-path (e.g. GitHub Pages /<repo>/).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
