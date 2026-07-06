/**
 * E2-checkBoundaries.test.ts
 *
 * Epic 2 (Platform Publication) — E2-0'-T3 / E2-1-T5 / E2-4-T2.
 *
 * Tests scripts/check-boundaries.mjs against real temp-directory fixtures
 * (not string matching against the regex in isolation) so a future change
 * to the multi-line import parsing is caught here rather than by someone
 * noticing the script silently stopped catching violations.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPackage,
  extractSpecifiers,
  iosIsolationAllowed,
  sitIsolationAllowed,
} from '../../../scripts/check-boundaries.mjs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-boundaries-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(relPath: string, content: string) {
  writeFileSync(join(dir, relPath), content, 'utf8');
}

describe('extractSpecifiers()', () => {
  it('finds a single-line named import', () => {
    const specs = extractSpecifiers(`import { Foo } from '@intelligence-os/shared-types';`);
    expect(specs.map((s: any) => s.specifier)).toEqual(['@intelligence-os/shared-types']);
  });

  it('finds a multi-line named import (the case a line-by-line regex would miss)', () => {
    const content = `import type {\n  ArtifactRequest,\n  ArtifactBlueprint,\n} from '@intelligence-os/shared-types';\n`;
    const specs = extractSpecifiers(content);
    expect(specs.map((s: any) => s.specifier)).toEqual(['@intelligence-os/shared-types']);
  });

  it('finds a re-export ("export ... from")', () => {
    const specs = extractSpecifiers(`export { IntelligenceOS } from './IntelligenceOS';`);
    expect(specs.map((s: any) => s.specifier)).toEqual(['./IntelligenceOS']);
  });

  it('finds a bare side-effect import', () => {
    const specs = extractSpecifiers(`import '@brandos/polyfill';`);
    expect(specs.map((s: any) => s.specifier)).toEqual(['@brandos/polyfill']);
  });

  it('finds multiple imports across a realistic file', () => {
    const content = [
      `import type { Foo } from '@intelligence-os/shared-types';`,
      `import { Bar } from './Bar';`,
      `import type { SupabaseClient } from '@supabase/supabase-js';`,
      ``,
      `export class X {}`,
    ].join('\n');
    const specs = extractSpecifiers(content).map((s: any) => s.specifier);
    expect(specs).toEqual([
      '@intelligence-os/shared-types',
      './Bar',
      '@supabase/supabase-js',
    ]);
  });
});

describe('iosIsolationAllowed()', () => {
  it.each([
    ['./IntelligenceOS', true],
    ['../types/domains', true],
    ['@intelligence-os/shared-types', true],
    ['@platform/cognition-contract', true],
    ['@supabase/supabase-js', true],
    ['node:crypto', true],
    ['@brandos/contracts', false],
    ['@brandos/anything', false],
    ['lodash', false],
    ['some-random-package', false],
  ])('%s → allowed=%s', (specifier, expected) => {
    expect(iosIsolationAllowed(specifier as string)).toBe(expected);
  });
});

describe('sitIsolationAllowed()', () => {
  it.each([
    ['./ArtifactBlueprint', true],
    ['node:crypto', true],
    ['@intelligence-os/core', false],
    ['@supabase/supabase-js', false],
    ['@brandos/anything', false],
  ])('%s → allowed=%s', (specifier, expected) => {
    expect(sitIsolationAllowed(specifier as string)).toBe(expected);
  });
});

describe('checkPackage() — RULE-IOS-ISOLATION against fixture files', () => {
  it('reports zero violations for a clean fixture', () => {
    write('clean.ts', `import type { Foo } from '@intelligence-os/shared-types';\nimport { Bar } from './Bar';\n`);
    const violations = checkPackage(dir, iosIsolationAllowed, dir);
    expect(violations).toEqual([]);
  });

  it('reports a violation for a single-line @brandos import, with correct file/line', () => {
    write('bad.ts', `import { Foo } from '@brandos/contracts';\n`);
    const violations = checkPackage(dir, iosIsolationAllowed, dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('bad.ts');
    expect(violations[0]!.line).toBe(1);
    expect(violations[0]!.specifier).toBe('@brandos/contracts');
  });

  it('reports a violation for a multi-line @brandos import, with the correct line number', () => {
    write(
      'bad-multiline.ts',
      `// header comment\nimport type {\n  Foo,\n  Bar,\n} from '@brandos/contracts';\n`,
    );
    const violations = checkPackage(dir, iosIsolationAllowed, dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.line).toBe(2); // the `import type {` line, not the `from` line
  });

  it('reports one violation per offending import, across multiple files', () => {
    write('a.ts', `import { X } from '@brandos/one';\n`);
    write('b.ts', `import { Y } from '@brandos/two';\nimport { Z } from 'lodash';\n`);
    const violations = checkPackage(dir, iosIsolationAllowed, dir);
    expect(violations).toHaveLength(3);
  });

  it('does not descend into node_modules or dist subdirectories', () => {
    write('good.ts', `import { Bar } from './Bar';\n`);
    const nm = join(dir, 'node_modules');
    mkdirSync(nm);
    writeFileSync(join(nm, 'evil.ts'), `import { X } from '@brandos/should-be-ignored';\n`);
    const violations = checkPackage(dir, iosIsolationAllowed, dir);
    expect(violations).toEqual([]);
  });
});

describe('checkPackage() — RULE-SIT-ISOLATION against fixture files', () => {
  it('flags any non-relative import, including the platform\'s own core package', () => {
    write('leaky.ts', `import type { Foo } from '@intelligence-os/core';\n`);
    const violations = checkPackage(dir, sitIsolationAllowed, dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.specifier).toBe('@intelligence-os/core');
  });

  it('allows pure relative-only files (the package\'s actual shape)', () => {
    write('ArtifactBlueprint.ts', `import type { ArtifactType } from './ArtifactRequest';\n`);
    const violations = checkPackage(dir, sitIsolationAllowed, dir);
    expect(violations).toEqual([]);
  });
});
