#!/usr/bin/env node
/**
 * generate-runtime-model.mjs
 * Produces .context/runtime_model.generated.md — the deployment/runtime
 * shape: which package is pure SDK vs environment-specific host (ADR-002),
 * every process entrypoint, and every required environment variable
 * (derived from real `requireEnv()`/`process.env` call sites, not guessed).
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE,
  extractEnvVars, filesUnder,
} from './lib/analyzer.mjs';

export function generate(model) {
  const lines = [];
  lines.push('# Runtime Model');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'Per ADR-002 ("apps runtime layer"): `packages/*` is the pure, environment-agnostic SDK; ' +
    '`apps/*` owns everything environment-specific (server bootstrap, deployment config, `.env`). ' +
    'Enforced mechanically by `RULE-IOS-ISOLATION` in `packages/intelligence-os/scripts/check-boundaries.mjs`.'
  );
  lines.push('');

  lines.push('## Process entrypoints');
  lines.push('');
  const entrypoints = [
    { file: 'apps/api/src/server.ts', desc: 'Traditional long-running Node HTTP server entrypoint (`pnpm dev:api`). Reads env, constructs `IntelligenceOS`, hosts `createCognitionHttpServer()`.' },
    { file: 'apps/api/api/cognition.ts', desc: 'Vercel Node Function entrypoint. Reuses the exact same `createCognitionHttpServer` by emitting a synthetic `\'request\'` event rather than reimplementing routing.' },
    { file: 'apps/demo/src/index.ts', desc: 'Standalone integration-validation client — proves IntelligenceOS is consumable purely over HTTP, independent of BrandOS.' },
    { file: 'apps/playground/src/index.ts', desc: 'Scaffold for a future interactive developer playground (not yet a functioning application).' },
  ];
  for (const e of entrypoints) {
    const f = model.files.find((x) => x.relPath === e.file);
    lines.push(`### \`${e.file}\``);
    lines.push('');
    lines.push(e.desc);
    if (f?.headerSummary) lines.push(`\n> ${f.headerSummary}`);
    lines.push('');
  }

  lines.push('## Required environment variables (derived from real call sites)');
  lines.push('');
  lines.push('| Variable | Referenced in |');
  lines.push('|---|---|');
  const envMap = new Map();
  for (const f of model.files) {
    for (const v of extractEnvVars(f.content)) {
      if (!envMap.has(v)) envMap.set(v, []);
      envMap.get(v).push(f.relPath);
    }
  }
  for (const [v, files] of [...envMap.entries()].sort()) {
    lines.push(`| \`${v}\` | ${files.map((f) => `\`${f}\``).join(', ')} |`);
  }
  lines.push('');

  lines.push('## Event bus runtime');
  lines.push('');
  lines.push(
    'Default: `InProcessEventBus` — synchronous, in-memory, single-process. Swap-in points for ' +
    '`BullMQEventBus` (task queues) or `InngestEventBus` (serverless) are documented as comments in ' +
    '`packages/intelligence-os/src/events/IntelligenceEventBus.ts` but not implemented — the ' +
    '`IntelligenceEventBus` interface is the extension point.'
  );
  lines.push('');

  lines.push('## Persistence runtime');
  lines.push('');
  lines.push(
    'Supabase Postgres, `intelligence` schema. A `SupabaseClient` is constructed once (in ' +
    '`apps/api`, or the demo/playground app) and injected into `IntelligenceOS`\'s constructor, ' +
    'which passes it down to each Domain class — never constructed inside `packages/intelligence-os/src`.'
  );
  lines.push('');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'runtime_model.generated.md'), generate(model));
  console.log('✅ .context/runtime_model.generated.md');
}
