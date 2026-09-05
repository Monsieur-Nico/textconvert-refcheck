import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      // main.ts is pure entry-point wiring (Actions context in, validateBody
      // out) -- like textConvert's own src/bin/** exclusion, it's exercised
      // by real usage rather than unit tests.
      exclude: ['**/*.d.ts', 'src/main.ts'],
      all: true,
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 85,
        statements: 95,
      },
    },
  },
});
