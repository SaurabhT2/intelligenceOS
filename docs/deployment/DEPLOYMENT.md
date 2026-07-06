# Deployment

IntelligenceOS's deployable runtime is `apps/api`. This document describes
how it gets from source to a running service; see
`docs/architecture/adr/ADR-002.md` for why the platform is split into
`apps/*` (runtimes) and `packages/*` (the reusable SDK) in the first place.

## Production target

**`https://intelligence.saurabhtiwariai.com`**, hosted on Vercel as a Node
Function (`apps/api/api/cognition.ts`), fronted by a `vercel.json` rewrite
so callers see the unprefixed `/v1/cognition/*` contract paths rather than
Vercel's `/api/*` file-based routing convention.

## Repository structure

```
intelligenceOS/
  apps/
    api/          the deployable runtime — see apps/api/README.md
    demo/         integration-validation client (not a production UI)
    playground/   scaffold for a future interactive developer tool
  packages/
    intelligence-os/          the platform SDK — all business logic
    cognition-contract/       cross-platform HTTP contract types
    shared-intelligence-types/  IntelligenceOS's own domain/event types
  docs/
  package.json
  pnpm-workspace.yaml
```

## Package vs. application responsibilities

| Layer | Owns | Never owns |
|---|---|---|
| `packages/intelligence-os` | Domains, pipelines, blueprint generation, knowledge extraction, database access, the HTTP route/auth logic itself (`createCognitionHttpServer` / `createCognitionRequestHandler`) | Environment variables, process lifecycle, deployment platform config, `.listen()` calls |
| `packages/cognition-contract`, `packages/shared-intelligence-types` | Type-only contracts, zero runtime dependencies | Any implementation |
| `apps/api` | Environment loading, dependency composition (Supabase client → `IntelligenceOS` → `CognitionProvider`), HTTP hosting, Vercel configuration | Any IntelligenceOS business logic — every import comes from `@intelligence-os/core`'s public surface |
| `apps/demo` | Calling the 5 public routes as a real consumer would, over HTTP | Any direct dependency on `packages/intelligence-os` — it only knows `@platform/cognition-contract`'s types and a base URL |
| `apps/playground` | (Future) interactive developer testing | Anything yet — currently a scaffold |

The dependency direction is enforced by convention and by
`packages/intelligence-os/scripts/check-boundaries.mjs`
(`RULE-IOS-ISOLATION`): `apps/* → packages/*` is allowed; the reverse must
never happen.

## Deployment flow

1. **Change lands in `packages/intelligence-os`, `packages/cognition-contract`, or `packages/shared-intelligence-types`.**
   `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, and
   `pnpm --filter @intelligence-os/core check:boundaries` all pass (this is
   what `pnpm validate` at the repo root runs).
2. **`apps/api` picks up the change automatically** through its
   `workspace:*` dependency on `@intelligence-os/core` — no version bump
   or publish step needed inside the monorepo.
3. **Vercel builds `apps/api`** (Root Directory set to `apps/api` in the
   Vercel project settings). Vercel resolves the pnpm workspace from the
   repo-root `pnpm-workspace.yaml`, so `@intelligence-os/core` resolves as
   a normal workspace dependency during the build.
4. **`vercel.json`'s rewrite** sends `/v1/cognition/:path*` to the single
   `api/cognition.ts` function, which builds one `IntelligenceOS` /
   `CognitionProvider` instance per warm function and reuses
   `@intelligence-os/core`'s `createCognitionRequestHandler` for every
   request — the same handler the traditional server
   (`apps/api/src/server.ts`) uses, so there is exactly one implementation
   of the routes regardless of which transport is running them.
5. **Environment variables** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `COGNITION_API_KEY`) are set in the Vercel project's Environment
   Variables settings, never committed. See `apps/api/.env.example` for
   local-development equivalents.
6. **Validate the deployment** by running `apps/demo` against it:
   ```bash
   INTELLIGENCE_OS_API_URL=https://intelligence.saurabhtiwariai.com \
   INTELLIGENCE_OS_API_KEY=<production COGNITION_API_KEY> \
     pnpm --filter @intelligence-os/demo start
   ```

## Local development

For local work against either transport, see `apps/api/README.md`
("Two ways to run this") and `apps/demo/README.md`.

## Future: BrandOS migration (not implemented)

BrandOS's `HttpCognitionProvider` already calls the exact routes,
auth header, and payload shapes `apps/api` serves. Migrating BrandOS to
the hosted deployment is expected to require only a configuration change
on BrandOS's side (`INTELLIGENCE_OS_API_URL` →
`https://intelligence.saurabhtiwariai.com`, plus a matching
`INTELLIGENCE_OS_API_KEY`), not a code change. That migration is out of
scope for this repository and is not implemented here.
