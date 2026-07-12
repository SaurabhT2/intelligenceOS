# @intelligence-os/demo

A minimal integration-validation client. **Not a production UI.**

## Purpose

Prove that IntelligenceOS can be consumed independently of BrandOS, by
calling its public HTTP routes over plain HTTP — the same way any real
consumer would, using nothing but the published contract types from
`@platform/cognition-contract`.

## Running it

Point it at a running instance of `apps/api` (local or hosted):

```bash
INTELLIGENCE_OS_API_URL=http://localhost:4100 \
INTELLIGENCE_OS_API_KEY=<matches the API's COGNITION_API_KEY> \
  pnpm --filter @intelligence-os/demo start
```

`INTELLIGENCE_OS_API_URL` defaults to `http://localhost:4100` if unset.
To validate the hosted deployment instead:

```bash
INTELLIGENCE_OS_API_URL=https://intelligence.saurabhtiwariai.com \
INTELLIGENCE_OS_API_KEY=<production COGNITION_API_KEY> \
  pnpm --filter @intelligence-os/demo start
```

## What it does

Calls, in order, and prints the status and body of each:

1. `GET /v1/cognition/health`
2. `POST /v1/cognition/resolve`
3. `POST /v1/cognition/observe`
4. `POST /v1/cognition/review`
5. `GET /v1/cognition/summary`
6. `POST /v1/knowledge/ingest` — added in the Completion Mission session.
   Before that session, both `apps/api` entrypoints left this route's
   optional wiring unset, so it returned `501` on every real deployment
   even though the extraction pipeline behind it was fully implemented. A
   `201` (with an `assetId`) here confirms the wiring fix is live on
   whichever deployment `INTELLIGENCE_OS_API_URL` points at; a `501` means
   that deployment is still running pre-fix code.

The goal is confirming every route is reachable and shaped correctly —
not that the demo workspace has meaningful accumulated intelligence yet,
so some responses may look sparse on a fresh workspace. That's expected.
