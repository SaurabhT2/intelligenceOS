# ADR-002 — Introduce an `apps/` Layer: Packages Are the Platform, Applications Are Runtimes

**Status:** Decided
**Decision:** Introduce `apps/api`, `apps/demo`, and `apps/playground` alongside the existing `packages/*`. Move all runtime wiring (server bootstrap, environment loading, dependency composition, HTTP hosting, deployment configuration) out of `packages/intelligence-os` and into `apps/api`. No IntelligenceOS business logic moves. No public HTTP contract changes.

---

## 1. Context

By the end of Milestone 3, IntelligenceOS was a standalone repository with independent package boundaries, a passing build/test suite, and a working HTTP surface (`createCognitionHttpServer`) exposed via a dev-only script, `packages/intelligence-os/src/dev/serve.ts`. That script did real work — it read environment variables, constructed a Supabase client, composed an `IntelligenceOS` instance, and called `.listen()` — but it lived *inside* the package it was hosting, gated behind a `dev` exclusion in `scripts/check-boundaries.mjs` specifically because it didn't belong to the isolated core domain that rule protects.

That was a reasonable stopgap for "prove the HTTP surface works," but it doesn't hold up as the platform moves toward independent cloud deployment at `https://intelligence.saurabhtiwariai.com`. A few concrete problems:

- **A published SDK shouldn't own a deployment target.** `@intelligence-os/core`'s `package.json` describes a library other packages install (`main`, `types`, `exports`, `publishConfig`). Bundling `dotenv`, a `serve` script, and (eventually) Vercel configuration into that same package conflates "the thing you `import`" with "the thing you deploy," which makes both harder to reason about independently — e.g. a consumer installing the package now transitively carries deployment-only tooling it will never use.
- **There was exactly one way to run IntelligenceOS, and it was a dev script.** Nothing distinguished "the way you run this locally while hacking on it" from "the way this actually gets deployed to production." Vercel readiness needs an actual deployment target, not a repurposed dev harness.
- **No way to prove independence without a second repository.** The whole point of this milestone is demonstrating that IntelligenceOS can be consumed over HTTP without BrandOS. A dev script inside the package being hosted doesn't demonstrate that; a separate application calling the package's public HTTP contract does.

## 2. Decision

Split the repository into two layers with a strict, one-directional dependency rule:

```
apps/*      →      packages/*      (allowed, and the only direction that exists)
packages/*  →      apps/*          (must never happen)
```

**Packages are the platform.** `packages/intelligence-os`, `packages/cognition-contract`, and `packages/shared-intelligence-types` remain reusable SDKs that can run anywhere, with zero knowledge of any specific host, deployment target, or environment. Nothing in `packages/*/src` reads `process.env`, constructs its own external clients from raw config, or knows what "Vercel" or "a demo script" is. This was already true in spirit (see `AGENT_CONTEXT.md`'s "Forbidden dependencies") — this ADR makes it complete by removing the one file that didn't follow it.

**Applications are runtimes.** `apps/*` are the only places allowed to know about environment variables, process lifecycle, specific deployment platforms, and how the platform's pieces get wired together for a specific purpose. Three applications, three distinct purposes:

- **`apps/api`** — the production deployment target. Owns server bootstrap, environment loading, dependency composition, HTTP hosting, and Vercel configuration. Contains two entrypoints sharing one request handler: `src/server.ts` (a traditional long-running Node process, direct successor to the old `dev/serve.ts`) and `api/cognition.ts` (a Vercel Node Function). No IntelligenceOS logic — every import comes from `@intelligence-os/core`'s public surface.
- **`apps/demo`** — an integration-validation client, not a production UI. Calls all 5 HTTP routes against a running `apps/api` instance (local or hosted) using nothing but the published `@platform/cognition-contract` types, to prove the platform is reachable and correctly shaped independent of any consumer application.
- **`apps/playground`** — a scaffold only, for future interactive developer testing. Deliberately not built out into a full application in this milestone; it exists so the workspace wiring (dependency on `@intelligence-os/core`) is proven correct now, without prematurely deciding what the interactive experience should look like.

## 3. What changed, concretely

- `packages/intelligence-os/src/dev/serve.ts` removed. Its logic moved to `apps/api/src/server.ts`, with one substantive change: imports now go through `@intelligence-os/core` (the package's public entry point) instead of relative paths into `src/`, because this app is a consumer of the platform now, not code living inside it.
- `packages/intelligence-os/src/api/http/server.ts`: `createCognitionHttpServer`'s route-matching, auth, and error-mapping logic was extracted into a newly-exported `createCognitionRequestHandler`, with `createCognitionHttpServer` becoming a thin wrapper around it (`createServer(createCognitionRequestHandler(...))`). This is a byte-for-byte behavior-preserving decomposition, not a contract change — `createCognitionHttpServer`'s signature and behavior are identical to before. It exists because a serverless runtime (Vercel's Node Functions) needs the handler function itself, not a `Server` object it can call `.listen()` on; `apps/api/api/cognition.ts` and `apps/api/src/server.ts` both now call the same handler through two different transports, with zero duplicated routing logic.
- `packages/intelligence-os/package.json`: removed the `serve` script and the `dotenv`/`tsx` dev dependencies it needed — this package no longer runs anything itself.
- `scripts/check-boundaries.mjs`: removed the `src/dev` carve-out from `RULE-IOS-ISOLATION`. That carve-out existed only because `dev/serve.ts` needed `dotenv`, a dependency the core isolation rule otherwise forbids. With that file gone, the rule now applies uniformly to all of `packages/intelligence-os/src`.
- `pnpm-workspace.yaml` and root `package.json`: `apps/*` added as first-class workspace projects; root scripts updated to point at `apps/api`'s `dev` script and `apps/demo`'s `start` script instead of the removed `serve` script.
- No route paths, request/response contracts, `CognitionProvider` interface methods, or shared types changed anywhere in this milestone.

## 4. Why this generalizes: reusable packages, deployable runtimes, platform evolution

The `apps/*` → `packages/*` direction is the same shape BrandOS's own future consumption of IntelligenceOS will take (see "Future Direction" below) — BrandOS will be *another* runtime calling IntelligenceOS over HTTP, structurally no different from `apps/demo` calling it, just with production traffic instead of a validation script. Getting this boundary right inside IntelligenceOS's own repository first is what makes that later integration a configuration change (point `INTELLIGENCE_OS_API_URL` at the hosted deployment) rather than a code change.

It also means IntelligenceOS can grow more runtimes without ever touching `packages/*`: a CLI, a scheduled job runner, a second regional deployment, or `apps/playground` growing into a real interactive tool — each is a new application depending on the same stable platform surface, never the platform depending on any of them.

## 5. Alternatives considered

- **Keep `dev/serve.ts` where it was, add Vercel config alongside it in `packages/intelligence-os`.** Rejected: this is the status quo this ADR is fixing. It would have made the published SDK's `package.json`/`files` list responsible for deployment concerns a consumer never needs, and given "how do I run this" exactly one dev-shaped answer instead of a real production path.
- **A single `apps/api` entrypoint using only Vercel Functions, no traditional server.** Rejected: local development and non-Vercel hosting (a container, a VM) both need a process that stays up and calls `.listen()`. Forcing every local run through `vercel dev` would tie the whole team's local workflow to one vendor's tooling. Keeping both, sharing one handler, costs almost nothing (one extra ~20-line file) and keeps the option open.
- **A framework (Express/Fastify) in `apps/api` instead of reusing the package's Node-`http`-based server.** Rejected for the same reason the original `server.ts` docblock gives: 5 fixed routes don't need a routing framework, and the package's existing implementation already works — `apps/api` reuses it rather than reimplementing routing at the application layer.

## 6. Future direction (context only, not implemented here)

```
BrandOS
   │
   │ HTTP
   ▼
IntelligenceOS API   (apps/api, hosted at intelligence.saurabhtiwariai.com)
   │
   ▼
Knowledge · Learning · Reasoning · Memory   (packages/intelligence-os)
```

BrandOS will later point its `HttpCognitionProvider` at the hosted `apps/api` deployment instead of a local process. Because `apps/api`'s routes, auth, and payload shapes are unchanged from what BrandOS already calls, that migration should require no BrandOS-side code change — only a URL and a shared secret. No BrandOS-side changes are made as part of this ADR or this milestone.

## 7. Consequences

- **Positive:** `packages/intelligence-os` is now provably a pure library — no environment reads, no process lifecycle, no deployment-specific dependency, checked mechanically by `check:boundaries` with no carve-outs left. `apps/api` has one clear job (host the platform) with two transports sharing one implementation. A new contributor can validate any deployment (local or hosted) with one command (`apps/demo`).
- **Negative / trade-offs:** One more workspace project to install and build (`pnpm -r` now touches `apps/*` too). `apps/api` carries a small amount of necessary duplication in *type adaptation* only (casting `VercelRequest`/`VercelResponse` to the Node HTTP types the shared handler expects) — no routing or business logic is duplicated.
- **Follow-up:** `apps/playground` remains a scaffold; deciding its actual interactive shape is future work, not blocked by this ADR.

## 8. Addendum — current status (added during documentation consolidation)

Verified directly against source: **§3's first, third, and fourth bullets did not fully happen.** `packages/intelligence-os/src/dev/serve.ts` was not removed — it still exists and still works. `packages/intelligence-os/package.json` still has a `"serve"` script and the `dotenv`/`tsx` dev dependencies it needed. `scripts/check-boundaries.mjs` still carves `src/dev/**` out of `RULE-IOS-ISOLATION`. The result is two near-duplicate HTTP launchers rather than one retired in favor of the other.

§3's second bullet (`createCognitionRequestHandler` as a separately-exported handler function) also does not match the shipped code: `createCognitionHttpServer` is the only exported function, and the Vercel entrypoint (`apps/api/api/cognition.ts`) dispatches into it by emitting a `'request'` event on the `http.Server` it returns rather than calling a separately-exported handler directly. The *outcome* this bullet describes — one implementation, two transports, zero duplicated routing logic — is still true; the specific mechanism described is not.

This is left as a discrepancy between this decision record and the code, not silently corrected here, per this repository's documentation-maintenance convention (`ARCHITECTURE.md`'s header note). See [`IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) Known Issues for the recommended next step, and [`DEPLOYMENT.md`](../DEPLOYMENT.md) and [`INTEGRATION_GUIDE.md`](../INTEGRATION_GUIDE.md) for what to actually call today.

## 9. Second addendum — partial convergence (Completion Mission session, documented at next consolidation)

One of the two launchers' capabilities has since converged: `apps/api`'s two entrypoints now both wire up the Knowledge Ingest route (`KnowledgeIngestPort`) that `dev/serve.ts` had and `apps/api` originally lacked — see `IMPLEMENTATION_STATUS.md`. `apps/api/src/server.ts` and `apps/api/api/cognition.ts` are now functionally equivalent to `dev/serve.ts` for every route both expose. The structural duplication described in §8 above (the file, script, and boundary-check carve-out all still existing) is otherwise unchanged — this addendum narrows what's actually still divergent between the two launchers, it doesn't resolve §8's core finding.
