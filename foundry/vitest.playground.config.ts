import { defineConfig } from 'vitest/config';

// End-to-end checks for the VFX playground (headless Chromium, software WebGL2). Run: npm run playground:e2e
export default defineConfig({
  test: { include: ['e2e/playground/**/*.pw.test.ts'], environment: 'node', testTimeout: 180000, hookTimeout: 120000, fileParallelism: false, pool: 'forks' },
});
