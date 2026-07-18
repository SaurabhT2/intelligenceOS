/**
 * apps/api/src/server.ts
 *
 * Milestone 4 (Monorepo Runtime Separation) — the traditional, long-running
 * Node process entrypoint for the IntelligenceOS API.
 *
 * This file is *runtime wiring only*: environment loading, dependency
 * composition, HTTP hosting, and startup/shutdown. Every building block it
 * wires together is published by `@intelligence-os/core`'s public surface
 * (`IntelligenceOS`, `createCognitionHttpServer`) — this file contains no
 * IntelligenceOS business logic itself and imports nothing from that
 * package's internals.
 *
 * This is the direct successor to
 * `packages/intelligence-os/src/dev/serve.ts` (Milestone 3), moved here
 * unchanged in behavior because a "dev-only harness" living inside the
 * package it's hosting was never quite right — the package is supposed to
 * be a reusable SDK that can run anywhere, and *something* has to be the
 * host application. That's what `apps/*` is for (see
 * docs/adr/ADR-002-apps-runtime-layer.md). The one substantive change from the
 * old file is the import path: `@intelligence-os/core` (the package's
 * public entry point) instead of relative paths into its `src/` — this
 * app is a consumer of the platform now, not code living inside it.
 *
 * Use this entrypoint for any persistent-process host (a VM, a container,
 * Fly.io, Render, etc.). For Vercel's serverless Node Functions, see
 * `apps/api/api/cognition.ts` instead — same routes, same auth, same
 * provider composition, different transport lifecycle.
 *
 * Configuration: copy `.env.example` (this app's root) to `.env` and fill
 * in your own values, or export the three variables manually / prefix the
 * command:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... COGNITION_API_KEY=... \
 *     pnpm --filter @intelligence-os/api dev
 *
 * Either way works — a `.env` file is picked up automatically if present,
 * but variables already set in the environment always take precedence
 * over the file (`override: false` below), so CI/production secrets
 * injected as real env vars are never silently shadowed by a local `.env`.
 */

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { IntelligenceOS, createCognitionHttpServer } from '@intelligence-os/core';

// Resolved from this file's own location, not process.cwd() — so `.env` in
// this app's root loads correctly whether `pnpm dev` is run from here or
// from the workspace root via `--filter`. `override: false` is dotenv's
// default, stated explicitly here because it's the behavior this script
// relies on: real environment variables always win over the file.
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: resolve(appRoot, '.env'), override: false });
// No error if `.env` doesn't exist — requireEnv() below still enforces
// the three required variables either way, from whatever source set them.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[api] Missing required environment variable: ${name}`);
    console.error('[api] Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COGNITION_API_KEY');
    console.error('[api] Optional: PORT (default 4100)');
    console.error(`[api] Copy .env.example to .env in ${appRoot} and fill in your values,`);
    console.error('[api] or export these three variables manually before running `pnpm dev`.');
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

  // `intelligenceOS` already structurally satisfies KnowledgeIngestPort
  // (ingestKnowledgeAsset(asset, rawContent?): Promise<string>), so passing
  // it here wires up POST /v1/knowledge/ingest with zero new code beyond
  // this line. Completion Mission (Capability Audit §5/§11.1): previously
  // omitted, which meant this route returned 501 even though the knowledge
  // ingestion capability it fronts was fully implemented and reachable via
  // the SDK path. Also, as of the same session's ADR-003 §2.4 closure
  // (audit finding D-4), `intelligenceOS` structurally satisfies the
  // port's now-optional `ingestWorkspaceConfiguration` too, so
  // POST /v1/workspace-configuration comes free the same way. Cognitive
  // Platform Evolution Program (Milestone 3, EM-3.1/EM-3.3): the same is
  // now true of `recordFeedbackEvent`/`recordCorrection` — both were
  // already real methods on `intelligenceOS`, so POST /v1/intelligence/
  // feedback and /v1/intelligence/correction come free here too, with no
  // change to this line.
  const server = createCognitionHttpServer(provider, { apiKey }, intelligenceOS);

  server.listen(port, () => {
    console.info(`[api] IntelligenceOS CognitionProvider HTTP API listening on :${port}`);
    console.info('[api] Routes: POST /v1/cognition/resolve, /observe, /review');
    console.info('[api]         GET  /v1/cognition/summary, /health');
    console.info('[api]         POST /v1/knowledge/ingest, /v1/workspace-configuration');
    console.info('[api]         POST /v1/intelligence/feedback, /v1/intelligence/correction');
    console.info(
      `[api] BrandOS-side config: INTELLIGENCE_OS_API_URL=http://localhost:${port} INTELLIGENCE_OS_API_KEY=<matches COGNITION_API_KEY>`
    );
  });

  const shutdown = () => {
    console.info('[api] Shutting down...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
