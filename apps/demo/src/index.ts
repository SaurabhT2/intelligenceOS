/**
 * apps/demo/src/index.ts
 *
 * Milestone 4 (Monorepo Runtime Separation) — integration validation
 * client.
 *
 * Purpose: prove that IntelligenceOS can be consumed independently of
 * BrandOS, by calling its 5 public HTTP routes exactly the way any real
 * consumer (BrandOS's `HttpCognitionProvider`, or a future one) would —
 * over plain HTTP, using nothing but the published contract types from
 * `@platform/cognition-contract`. This is deliberately **not** a
 * production UI: it's a scriptable client that exercises every route in
 * sequence and prints what came back, so a new contributor (or CI) can
 * confirm a deployment is wired correctly in one command.
 *
 * Usage:
 *   INTELLIGENCE_OS_API_URL=http://localhost:4100 \
 *   INTELLIGENCE_OS_API_KEY=<matches the API's COGNITION_API_KEY> \
 *     pnpm --filter @intelligence-os/demo start
 *
 * Defaults to http://localhost:4100 (apps/api's traditional server on its
 * default port) if INTELLIGENCE_OS_API_URL is not set. Point it at the
 * Vercel deployment (e.g. https://intelligence.saurabhtiwariai.com) to
 * validate that host instead — same client, same routes.
 */

import type {
  CognitionContext,
  CognitionHealth,
  CognitionRequest,
  CognitionReviewDecision,
  CognitionSummary,
  ObservationInput,
} from '@platform/cognition-contract';

const baseUrl = process.env.INTELLIGENCE_OS_API_URL ?? 'http://localhost:4100';
const apiKey = process.env.INTELLIGENCE_OS_API_KEY;

if (!apiKey) {
  console.error('[demo] Missing required environment variable: INTELLIGENCE_OS_API_KEY');
  console.error('[demo] Must match the target API instance\'s COGNITION_API_KEY.');
  process.exit(1);
}

const DEMO_WORKSPACE_ID = 'demo-workspace-001';

async function call<TResponse>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: TResponse | { error: string } }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : await res.json();
  return { status: res.status, data: data as TResponse | { error: string } };
}

function logStep(title: string, status: number, data: unknown): void {
  console.info(`\n── ${title} ──`);
  console.info(`status: ${status}`);
  console.info(JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  console.info(`[demo] Validating IntelligenceOS at ${baseUrl}`);

  // 1. Health — confirm the deployment is reachable at all before anything else.
  const health = await call<CognitionHealth>('GET', '/v1/cognition/health');
  logStep('GET /v1/cognition/health', health.status, health.data);

  // 2. Resolve — the read path a consumer calls before generating anything.
  const resolveRequest: CognitionRequest = { workspaceId: DEMO_WORKSPACE_ID };
  const resolved = await call<CognitionContext>('POST', '/v1/cognition/resolve', resolveRequest);
  logStep('POST /v1/cognition/resolve', resolved.status, resolved.data);

  // 3. Observe — report a hypothetical generation result, uninterpreted.
  const observation: ObservationInput = {
    workspaceId: DEMO_WORKSPACE_ID,
    requestId: `demo-request-${Date.now()}`,
    outputText: 'This is a sample generated artifact used only to validate the API surface.',
    score: 0.82,
    topic: 'demo-validation',
    wasRepaired: false,
  };
  const observed = await call<Record<string, never>>('POST', '/v1/cognition/observe', observation);
  logStep('POST /v1/cognition/observe', observed.status, observed.data);

  // 4. Review — pass through a human decision on previously surfaced material.
  const review: CognitionReviewDecision = {
    workspaceId: DEMO_WORKSPACE_ID,
    entryId: 'demo-entry-001',
    approved: true,
    reviewedBy: 'demo-script',
  };
  const reviewed = await call<Record<string, never>>('POST', '/v1/cognition/review', review);
  logStep('POST /v1/cognition/review', reviewed.status, reviewed.data);

  // 5. Summary — the display-ready view of the workspace's accumulated cognition.
  const summary = await call<CognitionSummary>(
    'GET',
    `/v1/cognition/summary?workspaceId=${encodeURIComponent(DEMO_WORKSPACE_ID)}`,
  );
  logStep('GET /v1/cognition/summary', summary.status, summary.data);

  console.info('\n[demo] Done. Non-2xx statuses above may be expected for an empty demo workspace —');
  console.info('[demo] the point of this script is that every route is reachable and shaped correctly,');
  console.info('[demo] not that the demo workspace has meaningful accumulated intelligence yet.');
}

main().catch((err) => {
  console.error('[demo] Failed:', err);
  process.exit(1);
});
