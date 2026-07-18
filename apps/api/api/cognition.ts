/**
 * apps/api/api/cognition.ts
 *
 * Vercel Node Function entrypoint for the IntelligenceOS API — the
 * production deployment target at https://intelligence.saurabhtiwariai.com
 * (see vercel.json's rewrite from /v1/cognition/* to this function, and
 * ADR-002 for why the routes stay unprefixed).
 *
 * This is deliberately *not* a reimplementation of the routing/auth logic
 * in `src/server.ts` — it reuses the exact same `createCognitionHttpServer`
 * that `@intelligence-os/core` exports for the traditional entrypoint.
 * `createCognitionHttpServer` returns a Node `http.Server` built via
 * `createServer(requestListener)`, which means the request-handling
 * callback is registered as that server's `'request'` event listener —
 * so a Vercel Node Function, which receives `(req, res)` per invocation
 * rather than owning the listen loop, can dispatch into the exact same
 * routing/auth logic by emitting a `'request'` event on the server
 * instead of calling `.listen()`. Vercel's `(req, res)` objects are a
 * structural superset of Node's `IncomingMessage`/`ServerResponse` for
 * every property that handler touches (`req.url`, `req.method`,
 * `req.headers`, `req.on`, `res.writeHead`, `res.end`), so this works
 * without reimplementing or duplicating any routes, auth, or response
 * shapes — this file stays pure transport adaptation, same as
 * `src/server.ts`.
 *
 * The `IntelligenceOS` instance and its `CognitionProvider` are built once
 * at module scope, not inside the handler — Vercel reuses a warm
 * function's module scope across invocations, so this avoids
 * reconstructing a Supabase client on every request while still building
 * fresh state on every cold start.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { IntelligenceOS, createCognitionHttpServer } from '@intelligence-os/core';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[api] Missing required environment variable: ${name}. ` +
        'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and COGNITION_API_KEY ' +
        "in the Vercel project's Environment Variables settings."
    );
  }
  return value;
}

const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);
const intelligenceOS = new IntelligenceOS({ supabase });
const provider = intelligenceOS.asCognitionProvider();
// Built but never `.listen()`-ed: on Vercel there's no persistent process
// to bind a port on, only this module's warm-start scope and a per-request
// (req, res) pair. Emitting `'request'` below dispatches straight into the
// same routing/auth logic `.listen()` would have used.
//
// `intelligenceOS` is passed as the third (KnowledgeIngestPort) argument —
// Completion Mission (Capability Audit §5/§11.1): previously omitted here
// too, so POST /v1/knowledge/ingest returned 501 on this deployment target
// even though the underlying capability was fully implemented. As of the
// same session's ADR-003 §2.4 closure (audit finding D-4),
// `intelligenceOS` also structurally satisfies the port's now-optional
// `ingestWorkspaceConfiguration`, so POST /v1/workspace-configuration is
// live on this deployment target too, with no further change here.
// Cognitive Platform Evolution Program (Milestone 3, EM-3.1/EM-3.3): same
// again for `recordFeedbackEvent`/`recordCorrection` — POST
// /v1/intelligence/feedback and /v1/intelligence/correction are live here
// too, with no change to this file.
const server = createCognitionHttpServer(
  provider,
  { apiKey: requireEnv('COGNITION_API_KEY') },
  intelligenceOS,
);

export default function cognitionHandler(req: VercelRequest, res: VercelResponse): void {
  // VercelRequest/VercelResponse are structurally compatible with the
  // IncomingMessage/ServerResponse pair the server's request listener
  // expects for the properties it reads and writes.
  server.emit('request', req as unknown as IncomingMessage, res as unknown as ServerResponse);
}
