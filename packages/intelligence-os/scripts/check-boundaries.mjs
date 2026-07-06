#!/usr/bin/env node
/**
 * check-boundaries.mjs
 *
 * Epic 2 (Platform Publication) — E2-0'-T3 / E2-1-T5 / E2-4-T2.
 *
 * Standalone tooling, owned by this platform, with zero new dependencies
 * (just Node's `fs`/`path`/`url`). Mechanically enforces two import-boundary
 * rules that were previously "true in the code but unguarded" (see
 * docs/IMPLEMENTATION_STATUS.md, Epic 1 exit criterion 6):
 *
 *   RULE-IOS-ISOLATION  `packages/intelligence-os/src/**` may only import:
 *     - relative paths (this package's own code)
 *     - `@intelligence-os/shared-types` (this platform's own domain/event
 *       types)
 *     - `@platform/cognition-contract` (Milestone 2 — the cross-platform
 *       system contract with BrandOS, per COGNITION_CONTRACT_SPEC.md §6:
 *       "Both live in @platform/cognition-contract, imported by both
 *       repositories, owned by neither platform's internals." Allowed here
 *       for the same reason `@intelligence-os/shared-types` is: it is a
 *       type-only contract package, not a leak toward BrandOS's internals —
 *       importing it is exactly what §3's `api/` layer is required to do.)
 *     - `@supabase/supabase-js` (the one legitimate external runtime
 *       dependency — see that package's own AGENT_CONTEXT.md)
 *     - Node built-ins (`node:*`)
 *   `src/dev/**` is excluded from RULE-IOS-ISOLATION entirely: it's a
 *   standalone local-dev launcher (`src/dev/serve.ts`), not part of the
 *   published SDK surface (nothing in `src/index.ts` imports from it) and
 *   not part of the isolated core domain this rule protects — nothing
 *   inside `src/` imports *from* `src/dev/`, so a dependency it takes for
 *   its own convenience (e.g. `dotenv`, to load a local `.env`) can't leak
 *   into, or compromise the isolation of, the core domain/library code.
 *   RULE-SIT-ISOLATION  `packages/shared-intelligence-types/src/**` may
 *     only import relative paths and Node built-ins — this package is
 *     documented as having zero runtime dependencies at all.
 *
 * Both rules generalize the original Epic 1 spec (which hardcoded a scan
 * for `@brandos/*`) to "no dependency on anything outside this platform's
 * own declared, minimal boundary" — Epic 2 has no single privileged
 * consumer to hardcode against, and a generic allowlist catches a leak
 * toward *any* future consumer package, not just one we happened to name.
 *
 * Usage:
 *   node scripts/check-boundaries.mjs        (from packages/intelligence-os/)
 *   pnpm check:boundaries                    (same, via package.json script)
 * Exits 1 with a violation report if any rule is broken; exits 0 otherwise.
 * Intended for CI as well as local use.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file lives at packages/intelligence-os/scripts/ — both sibling
// package src directories are two levels up, then into packages/*.
const PACKAGES_ROOT = join(__dirname, '..', '..');

/** Matches `import ... from '...'` and `export ... from '...'`, including
 *  statements whose `{ ... }` clause spans multiple lines. */
export const FROM_IMPORT_RE = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gs;
/** Matches bare side-effect imports: `import '...'`. */
export const BARE_IMPORT_RE = /\bimport\s*['"]([^'"]+)['"]/g;

export function findTsFiles(dir, out = [], excludeDirs = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || excludeDirs.includes(entry)) continue;
      findTsFiles(full, out, excludeDirs);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

export function lineNumberOf(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

export function extractSpecifiers(content) {
  const specifiers = [];
  for (const re of [FROM_IMPORT_RE, BARE_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      specifiers.push({ specifier: m[1], index: m.index });
    }
  }
  return specifiers;
}

/**
 * @param {string} srcDir      Absolute path to the package's src/ directory.
 * @param {(specifier: string) => boolean} isAllowed
 * @param {string} [relativeTo] Base path violation file paths are reported relative to.
 * @returns {{ file: string, line: number, specifier: string }[]}
 */
export function checkPackage(srcDir, isAllowed, relativeTo = PACKAGES_ROOT, excludeDirs = []) {
  const violations = [];
  for (const file of findTsFiles(srcDir, [], excludeDirs)) {
    const content = readFileSync(file, 'utf8');
    for (const { specifier, index } of extractSpecifiers(content)) {
      if (!isAllowed(specifier)) {
        violations.push({
          file: relative(relativeTo, file),
          line: lineNumberOf(content, index),
          specifier,
        });
      }
    }
  }
  return violations;
}

export const isRelative = (s) => s.startsWith('.') || s.startsWith('/');
export const isNodeBuiltin = (s) => s.startsWith('node:');

export const iosIsolationAllowed = (s) =>
  isRelative(s) ||
  isNodeBuiltin(s) ||
  s === '@intelligence-os/shared-types' ||
  s === '@platform/cognition-contract' ||
  s === '@supabase/supabase-js';

export const sitIsolationAllowed = (s) => isRelative(s) || isNodeBuiltin(s);

function report(ruleName, violations) {
  if (violations.length === 0) {
    console.log(`✅ ${ruleName}: clean (0 violations)`);
    return;
  }
  console.error(`❌ ${ruleName}: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`   ${v.file}:${v.line}  imports "${v.specifier}"`);
  }
}

// ── CLI entry point — only runs when this file is executed directly,
//    not when imported by the test suite. ──────────────────────────────────
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const iosViolations = checkPackage(
    join(PACKAGES_ROOT, 'intelligence-os', 'src'),
    iosIsolationAllowed,
    PACKAGES_ROOT,
    ['dev'],
  );
  const sitViolations = checkPackage(
    join(PACKAGES_ROOT, 'shared-intelligence-types', 'src'),
    sitIsolationAllowed,
  );

  report('RULE-IOS-ISOLATION', iosViolations);
  report('RULE-SIT-ISOLATION', sitViolations);

  const totalViolations = iosViolations.length + sitViolations.length;
  if (totalViolations > 0) {
    console.error(`\n${totalViolations} total boundary violation(s). See docs/IMPLEMENTATION_STATUS.md, "Platform boundary rules."`);
    process.exit(1);
  } else {
    console.log('\nAll platform boundary rules clean.');
    process.exit(0);
  }
}
