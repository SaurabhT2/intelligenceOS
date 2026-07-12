# @intelligence-os/api

The deployable runtime for IntelligenceOS. Production target:
**https://intelligence.saurabhtiwariai.com**

## What this app is (and isn't)

This app owns **runtime wiring only**: environment loading, dependency
composition (Supabase client → `IntelligenceOS` → `CognitionProvider`),
HTTP hosting, and startup/shutdown. It contains **no IntelligenceOS
business logic** — every domain, pipeline, blueprint, knowledge, and
database concern lives in `@intelligence-os/core`
(`packages/intelligence-os`), which this app depends on like any other
consumer would: through its published entry point, never through internal
paths.

See `docs/adr/ADR-002-apps-runtime-layer.md` for why this boundary exists.

## Two ways to run this

The same six HTTP routes are served both ways — only the transport
lifecycle differs.

### 1. Traditional long-running process (`src/server.ts`)

Use this for local development, or hosting on a VM/container/Fly.io/Render
— anything that keeps a process alive between requests.

```bash
cd apps/api
cp .env.example .env   # then fill in your own values
pnpm dev
```

`.env.example` documents all three required variables (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `COGNITION_API_KEY`) and one optional one
(`PORT`, default 4100).

To build and run the compiled output:

```bash
pnpm build
pnpm start
```

### 2. Vercel Node Function (`api/cognition.ts`)

Use this for the hosted production deployment. Vercel invokes
`api/cognition.ts` per request rather than keeping a process alive;
`vercel.json` rewrites the public contract paths
(`/v1/cognition/resolve`, `/observe`, `/review`, `/summary`, `/health`,
plus `/v1/knowledge/ingest`) to that single function, so callers never see
`/api/cognition` in the URL.

Deployment steps:

1. In the Vercel dashboard, create a project with **Root Directory** set
   to `apps/api`. Vercel auto-detects the pnpm workspace at the repo root
   from `pnpm-workspace.yaml`, so `@intelligence-os/core` resolves
   correctly during the build.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `COGNITION_API_KEY` under the project's Environment Variables. Do
   **not** commit these — `.env` is for local use only.
3. Point the domain `intelligence.saurabhtiwariai.com` at the project.
4. Deploy. `vercel dev` from `apps/api` reproduces this locally, including
   the rewrite behavior, if you want to test the serverless path before a
   real deploy.

Both entrypoints call the exact same request-handling logic
(`createCognitionHttpServer`, exported from `@intelligence-os/core`) — the
Vercel entrypoint never calls `.listen()` on the `http.Server` it returns;
it emits a `'request'` event on it per invocation instead. See that
function's docblock in `packages/intelligence-os/src/api/http/server.ts`
for why the split exists.

Both entrypoints also now pass `intelligenceOS` as `createCognitionHttpServer`'s
optional third (`KnowledgeIngestPort`) argument — as of the Completion
Mission session, `intelligenceOS` already structurally satisfies that port,
so wiring it up activates `POST /v1/knowledge/ingest` with no new code.
Before that session, neither entrypoint passed it and this route returned
`501` on every real deployment despite the Knowledge Pipeline behind it
being fully implemented — see `docs/IMPLEMENTATION_STATUS.md`.

## Routes

```
POST /v1/cognition/resolve   { workspaceId, taskType? }  -> CognitionContext
POST /v1/cognition/observe   ObservationInput             -> 204
POST /v1/cognition/review    CognitionReviewDecision       -> 204
GET  /v1/cognition/summary?workspaceId=...                -> CognitionSummary
GET  /v1/cognition/health                                  -> CognitionHealth
POST /v1/knowledge/ingest    { asset, rawContent }         -> 201 { assetId }
```

Auth: `Authorization: Bearer <COGNITION_API_KEY>` on every request.

The five `/v1/cognition/*` contracts are unchanged from prior milestones —
this app is a new host for them, not a new version of them.
`/v1/knowledge/ingest` is not part of the `CognitionProvider` contract
itself (see `docs/PLATFORM_CONTRACT.md`) — it's a separate, optional port
this app happens to wire up.

## Validating a deployment

`apps/demo` is a minimal script that calls all six routes against a
running instance of this app — point it at your local `pnpm dev` server or
at the hosted Vercel deployment to confirm IntelligenceOS is reachable
independently of any consumer application. See `apps/demo/README.md`.
