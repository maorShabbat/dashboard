import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/playground', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 4000,
    // pictures are inlined; font files stay separate so they load lazily, one file at a time
    assetsInlineLimit: (file: string) => (/\.woff2$/.test(file) ? false : true),
    rollupOptions: { input: 'playground.html' },
  },
  server: { port: 5174, host: '127.0.0.1' },
});
