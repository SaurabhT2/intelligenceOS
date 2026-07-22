#!/usr/bin/env node
/**
 * generate-monorepo-context.mjs
 * Produces .context/monorepo_context.generated.md — the top-level map of
 * the IntelligenceOS monorepo: packages, apps, workspace wiring, and the
 * dependency shape between them. Derived from pnpm-workspace.yaml,
 * every package.json, and the file tree — not from README prose.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
} from './lib/analyzer.mjs';

export function generate(model) {
  const lines = [];
  lines.push('# Monorepo Context — IntelligenceOS');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push('## What this repository is');
  lines.push('');
  lines.push(
    'IntelligenceOS is a deterministic user-intelligence layer and artifact-blueprint ' +
    'engine, published as an independently consumable platform SDK (see ' +
    '`packages/intelligence-os/package.json` description). It is consumed over HTTP by ' +
    'external platforms (e.g. BrandOS) via `@platform/cognition-contract`, and directly ' +
    'as a library by `apps/demo` and `apps/playground`.'
  );
  lines.push('');

  lines.push('## Package / app inventory');
  lines.push('');
  lines.push('| Package | Version | Dir | Dependencies (workspace + external) | Description |');
  lines.push('|---|---|---|---|---|');
  for (const pkg of model.packages) {
    const deps = pkg.dependencies.length ? pkg.dependencies.join(', ') : '_(none)_';
    lines.push(`| \`${pkg.name}\` | ${pkg.version ?? '—'} | \`${pkg.relDir}\` | ${deps} | ${pkg.description ?? '—'} |`);
  }
  lines.push('');

  lines.push('## Per-package file counts (source of truth: live file tree)');
  lines.push('');
  lines.push('| Package | .ts files parsed | Classes | Interfaces | Exported functions |');
  lines.push('|---|---|---|---|---|');
  for (const pkg of model.packages) {
    const files = model.files.filter((f) => f.relPath.startsWith(pkg.relDir + '/'));
    const classes = files.reduce((n, f) => n + f.classes.length, 0);
    const interfaces = files.reduce((n, f) => n + f.interfaces.length, 0);
    const fns = files.reduce((n, f) => n + f.functions.length + f.constArrowFns.length, 0);
    lines.push(`| \`${pkg.name}\` | ${files.length} | ${classes} | ${interfaces} | ${fns} |`);
  }
  lines.push('');

  lines.push('## Workspace scripts (root `package.json`)');
  lines.push('');
  const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  lines.push('```json');
  lines.push(JSON.stringify(rootPkg.scripts, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Directory shape of `packages/intelligence-os/src` (the core engine)');
  lines.push('');
  lines.push('```');
  const coreFiles = model.files
    .filter((f) => f.relPath.startsWith('packages/intelligence-os/src/'))
    .map((f) => f.relPath.replace('packages/intelligence-os/src/', ''));
  const dirs = new Map();
  for (const f of coreFiles) {
    const parts = f.split('/');
    const top = parts.length > 1 ? parts[0] : '(root)';
    dirs.set(top, (dirs.get(top) ?? 0) + 1);
  }
  for (const [dir, count] of [...dirs.entries()].sort()) {
    lines.push(`${dir}/  (${count} file${count === 1 ? '' : 's'})`);
  }
  lines.push('```');
  lines.push('');
  lines.push(
    'Each of these subdirectories except `types/`, `db/`, and `utils/` carries its own ' +
    '`AGENT_CONTEXT.md` hand-authored companion — this generated corpus cross-references ' +
    'those but is derived independently from source, per the mission\'s ' +
    '"documentation is secondary, implementation is the source of truth" directive.'
  );
  lines.push('');

  lines.push('## Where to go next');
  lines.push('');
  lines.push('- `.context/architecture_graph.generated.json` — the full module dependency graph.');
  lines.push('- `.context/cognition_pipeline.generated.md` — the end-to-end request pipeline.');
  lines.push('- `.context/learning_pipeline.generated.md` — the learning lifecycle.');
  lines.push('- `.context/knowledge_pipeline.generated.md` — the knowledge ingestion lifecycle.');
  lines.push('- `.context/identity_pipeline.generated.md` — identity derivation.');
  lines.push('- `.context/domain_ownership.generated.md` — table ownership map.');
  lines.push('- `.context/repository_health.generated.md` — automatically detected issues.');
  lines.push('- `READMEFIRST.md` (repo root) — read this first, before this file.');
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'monorepo_context.generated.md'), generate(model));
  console.log('✅ .context/monorepo_context.generated.md');
}
