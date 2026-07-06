/**
 * apps/api/api/cognition.ts
 *
 * Vercel Node Function entrypoint for the IntelligenceOS API — the
 * production deployment target at https://intelligence.saurabhtiwariai.com
 * (see vercel.json's rewrite from /v1/cognition/* to this function, and
 * ADR-002 for why the routes stay unprefixed).
 *
 * This is deliberately *not* a reimplementation of the routing/auth logic
 * in `src/server.ts` — it reuses the exact same
 * `createCognitionRequestHandler` that `@intelligence-os/core` exports.
 * A Vercel Node Function receives `(req, res)` objects that are a
 * structural superset of Node's `IncomingMessage`/`ServerResponse` for
 * every property that handler touches (`req.url`, `req.method`,
 * `req.headers`, `req.on`, `res.writeHead`, `res.end`), so the same
 * function that a persistent process would pass to `http.createServer`
 * can be called directly here, per request. No routes, auth, or response
 * shapes are duplicated or re-derived — this file is pure transport
 * adaptation, same as `src/server.ts`.
 *
 * The `IntelligenceOS` instance and its `CognitionProvider` are built once
 * at module scope, not inside the handler — Vercel reuses a warm
 * function's module scope across invocations, so this avoids
 * reconstructing a Supabase client on every request while still building
 * fresh state on every cold start.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { IntelligenceOS, createCognitionRequestHandler } from '@intelligence-os/core';

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
const handler = createCognitionRequestHandler(provider, { apiKey: requireEnv('COGNITION_API_KEY') });

export default function cognitionHandler(req: VercelRequest, res: VercelResponse): void {
  // VercelRequest/VercelResponse are structurally compatible with the
  // IncomingMessage/ServerResponse pair createCognitionRequestHandler
  // expects for the properties it reads and writes.
  void handler(req as unknown as Parameters<typeof handler>[0], res as unknown as Parameters<typeof handler>[1]);
}
