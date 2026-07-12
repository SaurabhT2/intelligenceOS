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
 * Plus one Milestone 3, Phase 1 route (Knowledge API), only active when a
 * `KnowledgeIngestPort` is supplied to `createCognitionHttpServer`:
 *
 *   POST /v1/knowledge/ingest   { asset: KnowledgeAssetInput, rawContent? } -> { assetId }
 *
 * Plus one Completion Mission route, only active when the supplied
 * `KnowledgeIngestPort` implements `ingestWorkspaceConfiguration` (ADR-003
 * §2.4, closing audit finding D-4):
 *
 *   POST /v1/workspace-configuration   WorkspaceConfigurationInput -> { assetId }
 *
 * This is deliberately NOT part of the CognitionProvider contract (see
 * `KnowledgeIngestPort`'s own docblock below) — it exists so BrandOS's
 * asset-upload route has somewhere to hand off an uploaded asset for
 * extraction, reusing `IntelligenceOS.ingestKnowledgeAsset()` as-is.
 * Future sibling routes (reindex/delete/status) are intentionally not
 * added yet — see the Milestone 3 report's API Design section.
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

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type {
  CognitionProvider,
  CognitionRequest,
  ObservationInput,
  CognitionReviewDecision,
} from '@platform/cognition-contract';
import type { KnowledgeAssetInput, WorkspaceConfigurationInput } from '../../types/domains';
import { EntityNotFoundError, ValidationError } from '../../errors';

export interface CognitionHttpServerOptions {
  /** Shared-secret bearer token expected on every request. */
  apiKey: string;
  /** Injectable for tests; defaults to `console`. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/**
 * Milestone 3, Phase 1 (Knowledge API).
 *
 * `IntelligenceOS.ingestKnowledgeAsset()` is not part of `CognitionProvider`
 * (that interface is scoped to the cognition read/observe contract only —
 * see CognitionContext.ts's own header, "the entire cognitive vocabulary
 * BrandOS is permitted to have"). Knowledge ingestion is a different,
 * narrower concern — a single write endpoint — so it gets its own small,
 * optional port instead of growing `CognitionProvider`. Passing this is
 * optional so every existing caller of `createCognitionHttpServer`
 * (constructed with just a `CognitionProvider`) keeps compiling unchanged.
 */
export interface KnowledgeIngestPort {
  ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent?: string): Promise<string>;
  /**
   * ADR-003 §2.4 — optional so every existing caller of
   * `createCognitionHttpServer` keeps compiling unchanged, exactly like
   * `ingestKnowledgeAsset` above. Wires `POST /v1/workspace-configuration`
   * when supplied. Closes Completion Mission audit finding D-4 (the
   * method existed with zero reachable callers, including over HTTP).
   */
  ingestWorkspaceConfiguration?(input: WorkspaceConfigurationInput): Promise<string>;
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
 * Creates (but does not start) an HTTP server implementing the 5
 * CognitionProvider routes. Call `.listen(port)` on the result.
 *
 * Accepts the CognitionProvider interface, not the concrete
 * CognitionProviderImpl class — this function only ever calls the 5
 * interface methods (resolveCognitionContext, observe, review,
 * summarizeCognition, checkHealth), so any conforming implementation
 * works, including IntelligenceOS.asCognitionProvider()'s return value
 * and test doubles. (Previously typed to CognitionProviderImpl
 * specifically; caught as a real typecheck failure once
 * src/dev/serve.ts — new in the Milestone 3+ Engineering Workflow Audit —
 * became the first caller to pass a plain CognitionProvider-typed value.)
 */
export function createCognitionHttpServer(
  provider: CognitionProvider,
  options: CognitionHttpServerOptions,
  knowledge?: KnowledgeIngestPort,
) {
  const logger = options.logger ?? console;

  return createServer(async (req, res) => {
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

      // ── Milestone 3, Phase 1 — Knowledge API ──────────────────────────
      // Only wired up if a KnowledgeIngestPort was provided (see
      // src/dev/serve.ts). Future-compatible sibling routes
      // (reindex/delete/status) are intentionally NOT stubbed here per
      // "only implement what is necessary now."
      if (req.method === 'POST' && url.pathname === '/v1/knowledge/ingest') {
        if (!knowledge) {
          sendJson(res, 501, { error: 'knowledge ingestion not configured on this server' });
          return;
        }
        const body = JSON.parse(await readBody(req)) as {
          asset: KnowledgeAssetInput;
          rawContent?: string;
        };
        if (!body?.asset) {
          sendJson(res, 400, { error: 'asset is required' });
          return;
        }
        const assetId = await knowledge.ingestKnowledgeAsset(body.asset, body.rawContent);
        sendJson(res, 201, { assetId });
        return;
      }

      // ── ADR-003 §2.4 — Workspace Configuration ingestion ──────────────
      // Same optional-port pattern as /v1/knowledge/ingest above. Only
      // wired up if the supplied `knowledge` port implements
      // `ingestWorkspaceConfiguration` (it's optional on the interface so
      // older callers of `createCognitionHttpServer` keep compiling).
      // Closes Completion Mission audit finding D-4.
      if (req.method === 'POST' && url.pathname === '/v1/workspace-configuration') {
        if (!knowledge?.ingestWorkspaceConfiguration) {
          sendJson(res, 501, { error: 'workspace configuration ingestion not configured on this server' });
          return;
        }
        const body = JSON.parse(await readBody(req)) as WorkspaceConfigurationInput;
        if (!body?.workspaceId) {
          sendJson(res, 400, { error: 'workspaceId is required' });
          return;
        }
        const assetId = await knowledge.ingestWorkspaceConfiguration(body);
        sendJson(res, 201, { assetId });
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
  });
}
