import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set when building for GitHub Pages, where the app lives under /app/ (the website is at the root of the domain).
export default defineConfig({ plugins: [react()], base: process.env.BASE_PATH || '/' });
