import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set when building for GitHub Pages, where the app lives under /app/ (the website is at the root of the domain).
// VITE_DEMO=1 builds the prototype: one script file (no lazy chunks) so it can be packed into a single page.
const demo = process.env.VITE_DEMO === '1';
export default defineConfig({
  plugins: [react()],
  base: demo ? './' : process.env.BASE_PATH || '/',
  build: demo ? { outDir: 'dist-demo', rollupOptions: { output: { inlineDynamicImports: true } } } : {},
});
