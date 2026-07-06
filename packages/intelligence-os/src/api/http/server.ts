/**
 * server.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * Exposes `CognitionProviderImpl` over the 5 HTTP routes documented in
 * HANDOFF_REPORT.md §11 as what BrandOS's `HttpCognitionProvider` already
 * calls:
 *
 *   POST /v1/cognition/resolve   { workspaceId, taskType? }  -> CognitionContext
 *   POST /v1/cognition/observe   ObservationInput             -> 204
 *   POST /v1/cognition/review    CognitionReviewDecision       -> 204
 *   GET  /v1/cognition/summary?workspaceId=...                -> CognitionSummary
 *   GET  /v1/cognition/health                                  -> CognitionHealth
 *
 * Per HANDOFF_REPORT.md §14 ("Assumptions Made"), these exact route paths
 * were the previous session's proposal, not a fixed requirement from any
 * architecture document — they are honored here as-is since no
 * contradicting instruction has been given, and matching them exactly is
 * what lets `HttpCognitionProvider` complete a real round trip without any
 * BrandOS-side change (Milestone 2 principle 7: don't modify BrandOS).
 *
 * Auth: `Authorization: Bearer <apiKey>`, matching `HttpCognitionProvider`'s
 * documented header. Service-to-service only — no user-facing auth here.
 *
 * Deliberately built on Node's built-in `http` module rather than adding a
 * framework dependency (Express/Fastify/etc.) — this package has exactly
 * one runtime dependency today (`@supabase/supabase-js`); a routing
 * framework is more machinery than 5 fixed routes need, and avoiding it
 * keeps this module reviewable as "genuinely missing wiring," not a new
 * subsystem.
 */

import { createServer, type IncomingMessage, type ServerResponse, type RequestListener } from 'node:http';
import type {
  CognitionProvider,
  CognitionRequest,
  ObservationInput,
  CognitionReviewDecision,
} from '@platform/cognition-contract';
import { EntityNotFoundError, ValidationError } from '../../errors';

export interface CognitionHttpServerOptions {
  /** Shared-secret bearer token expected on every request. */
  apiKey: string;
  /** Injectable for tests; defaults to `console`. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

const MAX_BODY_BYTES = 1_000_000; // 1MB — generous for this contract's small payloads.

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const header = req.headers['authorization'];
  return header === `Bearer ${apiKey}`;
}

/**
 * Builds the request-handling function for the 5 CognitionProvider routes,
 * without binding it to any transport. This is the part that's actually
 * "the API": route matching, auth, body parsing, and error-shape mapping.
 *
 * Split out from `createCognitionHttpServer` (Milestone 4 — apps/api
 * introduction) because that function's `createServer(...)` call is only
 * one of two valid ways to run this handler:
 *   - a long-lived Node process calls `.listen(port)` on the `Server`
 *     `createCognitionHttpServer` returns (apps/api's `src/server.ts`,
 *     or any other persistent host).
 *   - a per-invocation serverless runtime (e.g. a Vercel Node Function)
 *     instead calls this handler directly with its own request/response
 *     objects, which are structurally compatible with Node's
 *     `IncomingMessage`/`ServerResponse` for every property this handler
 *     reads or writes (`req.url`, `req.method`, `req.headers`, `req.on`,
 *     `res.writeHead`, `res.end`) — see apps/api/api/cognition.ts.
 * This is purely a decomposition of existing behavior: `createCognitionHttpServer`
 * below still does exactly what it did before, byte for byte. Nothing about
 * the routes, auth, or response shapes changes.
 *
 * Accepts the CognitionProvider interface, not the concrete
 * CognitionProviderImpl class — this function only ever calls the 5
 * interface methods (resolveCognitionContext, observe, review,
 * summarizeCognition, checkHealth), so any conforming implementation
 * works, including IntelligenceOS.asCognitionProvider()'s return value
 * and test doubles.
 */
export function createCognitionRequestHandler(
  provider: CognitionProvider,
  options: CognitionHttpServerOptions,
): RequestListener {
  const logger = options.logger ?? console;

  return async (req, res) => {
    try {
      if (!isAuthorized(req, options.apiKey)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }

      const url = new URL(req.url ?? '/', 'http://internal');

      if (req.method === 'POST' && url.pathname === '/v1/cognition/resolve') {
        const body = JSON.parse(await readBody(req)) as CognitionRequest;
        if (!body.workspaceId) {
          sendJson(res, 400, { error: 'workspaceId is required' });
          return;
        }
        const context = await provider.resolveCognitionContext(body);
        sendJson(res, 200, context);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/cognition/observe') {
        const body = JSON.parse(await readBody(req)) as ObservationInput;
        await provider.observe(body);
        res.writeHead(204).end();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/cognition/review') {
        const body = JSON.parse(await readBody(req)) as CognitionReviewDecision;
        await provider.review(body);
        res.writeHead(204).end();
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/cognition/summary') {
        const workspaceId = url.searchParams.get('workspaceId');
        if (!workspaceId) {
          sendJson(res, 400, { error: 'workspaceId query parameter is required' });
          return;
        }
        const summary = await provider.summarizeCognition(workspaceId);
        sendJson(res, 200, summary);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/cognition/health') {
        const health = await provider.checkHealth();
        sendJson(res, health.healthy ? 200 : 503, health);
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      if (err instanceof EntityNotFoundError) {
        sendJson(res, 404, { error: err.message });
        return;
      }
      if (err instanceof ValidationError) {
        sendJson(res, 400, { error: err.message, field: err.field });
        return;
      }
      logger.error('[cognition-http] unhandled error:', err);
      sendJson(res, 500, { error: 'internal error' });
    }
  };
}

/**
 * Creates (but does not start) an HTTP server implementing the 5
 * CognitionProvider routes. Call `.listen(port)` on the result.
 *
 * Unchanged public signature and behavior — this is now a thin wrapper
 * around `createCognitionRequestHandler` (see that function's docblock
 * for why the split exists). Existing callers (apps/api's traditional
 * server bootstrap, this package's own tests) are unaffected.
 */
export function createCognitionHttpServer(
  provider: CognitionProvider,
  options: CognitionHttpServerOptions,
) {
  return createServer(createCognitionRequestHandler(provider, options));
}
