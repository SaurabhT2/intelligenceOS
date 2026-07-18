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
      ],
      thresholds: {
        // Raised from the Sprint 0 defaults (lines: 40, branches: 30) after
        // closing the test-coverage gap IMPLEMENTATION_STATUS.md/ROADMAP.md
        // flagged (dedicated unit tests added for HypothesisEngine,
        // LearningValidator.evaluate(), ProfileBuilder's pre-ADR-004 logic,
        // and ProjectContextBuilder). Actual coverage as of this change is
        // ~89% lines / ~84% branches; these thresholds sit a few points
        // below that as headroom, not at the ceiling, so ordinary new code
        // doesn't immediately fail CI while still meaningfully enforcing
        // the gap stays closed.
        lines: 85,
        branches: 78,
      },
    },
  },
});
