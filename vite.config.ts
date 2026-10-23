import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set when building for GitHub Pages, where the site lives under /project-tracker/.
export default defineConfig({ plugins: [react()], base: process.env.BASE_PATH || '/' });
