import { defineConfig } from 'vitest/config';
import base from '../vitest.config.mts';

// Reuses the repository's own test setup (aliases to packages/* sources,
// legacy decorators, reflect-metadata) but only runs the learning specs.
// (mergeConfig would concatenate `include` arrays, so we override by spread.)
// Run from the repository root:
//   npx vitest run --config learning/vitest.config.mts
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['learning/**/*.spec.ts'],
  },
});
