/**
 * src/dev/serve.ts
 *
 * Milestone 3, Phase 1/2 — the missing "run" step.
 *
 * Every building block this script wires together already existed after
 * Milestone 2: `IntelligenceOS.asCognitionProvider()` composes a
 * `CognitionProviderImpl` from the real domains, and
 * `createCognitionHttpServer()` exposes any `CognitionProvider` over the 5
 * HTTP routes BrandOS's `HttpCognitionProvider` calls. What was missing was
 * a runnable entrypoint that actually calls `.listen()` — without it, "run
 * IntelligenceOS" required a new developer to write this wiring themselves
 * before Phase 1's BrandOS → IntelligenceOS flow could be verified end to
 * end. This file adds no new capability; it is the last, mechanical step
 * connecting two things Milestone 2 already built.
 *
 * This is a dev-only harness, not part of the published SDK — the
 * `@intelligence-os/core` library itself (see the package README) never
 * reads environment variables or creates its own Supabase client; only
 * this standalone script does, because *something* has to be the "host
 * application" to run the HTTP surface locally. Loading `.env` here doesn't
 * change that: it's just this file's own convenience for populating
 * `process.env` before it does what any host application would.
 *
 * Configuration: copy `.env.example` (in this package's root — same
 * directory as this package's `package.json`) to `.env` and fill in your
 * own values, or export the three variables manually / prefix the command:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... COGNITION_API_KEY=... \
 *     pnpm --filter @intelligence-os/core serve
 *
 * Either way works — a `.env` file is picked up automatically if present,
 * but variables already set in the environment always take precedence
 * over the file (see `override: false` below) so CI/production secrets
 * injected as real env vars are never silently shadowed by a local `.env`.
 *
 * See the platform-level PLATFORM_INTEGRATION.md (repo root's sibling
 * BrandOS checkout) for the full local two-repo workflow this plugs into.
 */

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { IntelligenceOS } from '../IntelligenceOS';
import { createCognitionHttpServer } from '../api/http/server';

// Resolved from this file's own location, not process.cwd() — so `.env` in
// this package's root loads correctly whether `pnpm serve` is run from
// here, from the workspace root via `--filter`, or via Engineering's
// platform-cli.mjs. `override: false` is dotenv's default, stated
// explicitly here because it's the behavior this script relies on: real
// environment variables always win over the file.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadDotenv({ path: resolve(packageRoot, '.env'), override: false });
// No error if `.env` doesn't exist — requireEnv() below still enforces
// the three required variables either way, from whatever source set them.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[serve] Missing required environment variable: ${name}`);
    console.error('[serve] Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COGNITION_API_KEY');
    console.error('[serve] Optional: PORT (default 4100)');
    console.error(`[serve] Copy .env.example to .env in ${packageRoot} and fill in your values,`);
    console.error('[serve] or export these three variables manually before running `pnpm serve`.');
    process.exit(1);
  }
  return value;
}

function main(): void {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = requireEnv('COGNITION_API_KEY');
  const port = Number(process.env.PORT ?? 4100);

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const intelligenceOS = new IntelligenceOS({ supabase });
  const provider = intelligenceOS.asCognitionProvider();

  // Milestone 3, Phase 1 — expose the already-implemented
  // ingestKnowledgeAsset() over HTTP too. Bound so `this` inside
  // IntelligenceOS is preserved when the server calls it as a bare
  // function. ingestWorkspaceConfiguration() added during the Completion
  // Mission session (ADR-003 §2.4, closing audit finding D-4) for parity
  // with apps/api/src/server.ts, which gets this for free by passing
  // `intelligenceOS` directly.
  const server = createCognitionHttpServer(provider, { apiKey }, {
    ingestKnowledgeAsset: intelligenceOS.ingestKnowledgeAsset.bind(intelligenceOS),
    ingestWorkspaceConfiguration: intelligenceOS.ingestWorkspaceConfiguration.bind(intelligenceOS),
  });

  server.listen(port, () => {
    console.info(`[serve] IntelligenceOS CognitionProvider HTTP API listening on :${port}`);
    console.info('[serve] Routes: POST /v1/cognition/resolve, /observe, /review');
    console.info('[serve]         GET  /v1/cognition/summary, /health');
    console.info('[serve]         POST /v1/knowledge/ingest, /workspace-configuration');
    console.info(
      `[serve] BrandOS-side config: INTELLIGENCE_OS_API_URL=http://localhost:${port} INTELLIGENCE_OS_API_KEY=<matches COGNITION_API_KEY>`
    );
  });

  const shutdown = () => {
    console.info('[serve] Shutting down...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
