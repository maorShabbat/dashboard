import { defineConfig } from 'vitest/config';

// End-to-end checks for generated Foundry games (headless Chromium + mock RGS). Run: npm run foundry:e2e
export default defineConfig({
  test: { include: ['e2e/foundry/**/*.pw.test.ts'], environment: 'node', testTimeout: 120000, hookTimeout: 120000, fileParallelism: false, pool: 'forks' },
});
