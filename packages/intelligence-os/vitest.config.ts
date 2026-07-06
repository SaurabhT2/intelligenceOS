import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/db/queries/**',   // stub files, no coverage needed in Sprint 0
      ],
      thresholds: {
        lines: 40,             // low threshold for Sprint 0 (mostly stubs)
        branches: 30,
      },
    },
  },
});
