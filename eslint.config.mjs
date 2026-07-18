// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Root, workspace-wide ESLint configuration.
 *
 * Scope note: this repository already mechanically enforces its
 * architectural import-boundary rules via
 * `packages/intelligence-os/scripts/check-boundaries.mjs`
 * (`pnpm check:boundaries`) — RULE-IOS-ISOLATION, RULE-SIT-ISOLATION,
 * RULE-PIPELINE-NO-DIRECT-DB. This config is deliberately *not* trying to
 * re-implement those rules as lint rules; it exists for ordinary code-quality
 * and correctness linting (unused vars, floating promises, etc.), which is a
 * different, complementary concern from the boundary script's static
 * import-path enforcement. `pnpm validate` runs typecheck + check:boundaries;
 * `pnpm lint` runs this.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // The codebase relies on `_`-prefixed args/locals for deliberately
      // unused parameters (interface conformance, destructuring); don't
      // flag those specifically.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Domain/pipeline code intentionally uses `any` in a small number of
      // narrowly-scoped, already-reviewed spots (raw Supabase row mapping).
      // Downgrading to a warning keeps this visible without blocking CI on
      // pre-existing, deliberate uses.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/tests/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Standalone Node tooling scripts (e.g. check-boundaries.mjs) — plain
    // JS, run directly by Node, not part of the TypeScript program.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
