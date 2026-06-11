import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Exclude test files and the two pure re-export barrels (the other index.ts
      // files — upstream/versioning/server — hold the actual logic).
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/auth/index.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      // Regression floor, set just below the current baseline. Raise as coverage grows.
      thresholds: {
        statements: 90,
        branches: 78,
        functions: 95,
        lines: 92,
      },
    },
  },
});
