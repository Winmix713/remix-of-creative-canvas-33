import { defineConfig } from 'vitest/config';

/**
 * Canonical Vitest configuration (F05).
 *
 * This file is the single discovery contract for every Vitest-discovered test
 * file; vite.config.ts deliberately carries no `test` block. `npm run
 * test:discovery` prints the discovered-file manifest and fails if a maintained
 * test file does not belong to a command, or if the `include` patterns below
 * drift from that contract.
 *
 * Discovery contract:
 *   node:test  -> tests/*.test.ts                (npm run test:core)
 *   vitest     -> tests/*.ui.spec.ts(x)          (npm run test:ui)
 *                 src/__tests__/*.test.ts
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'tests/*.ui.spec.ts',
      'tests/*.ui.spec.tsx',
      'src/__tests__/*.test.ts',
    ],
    pool: 'forks',
    fileParallelism: false,
  },
});
