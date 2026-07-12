# Intelligence OS

A deterministic user-intelligence layer and artifact-blueprint engine, published as an independently consumable platform — `@intelligence-os/core` and its contract package `@intelligence-os/shared-types` — and deployable as its own cloud service via `apps/api`.

**Start here:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) is the canonical onboarding document — mission, architecture, package responsibilities, and the rules every contributor (human or AI agent) is expected to follow. Read it before reading anything else in this repository, including this file.

For the platform's current implementation status, completed capabilities, and known issues, see [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md) — the canonical handover document. For what's planned next, see [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Documentation map

| Document | Covers |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Mission, structure, package responsibilities, domain model, pipelines, rules, read order — start here |
| [`docs/PLATFORM_CONTRACT.md`](./docs/PLATFORM_CONTRACT.md) | The BrandOS ⇄ IntelligenceOS cross-repository contract, current implementation and target design |
| [`docs/INTEGRATION_GUIDE.md`](./docs/INTEGRATION_GUIDE.md) | How to consume this platform (in-process SDK or HTTP), plus the full public API surface reference |
| [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md) | Current verified state, timeline, known issues and technical debt |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | What's planned next |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | How `apps/api` gets from source to a running service |
| [`docs/adr/`](./docs/adr/) | Architectural decision records |
| [`docs/archive/`](./docs/archive/) | Historical specs, planning documents, and superseded status snapshots — deep background, not onboarding material |

See [`docs/README.md`](./docs/README.md) for the full documentation index.

## Repository structure

```
intelligenceOS/
  apps/
    api/          deployable runtime — hosts IntelligenceOS over HTTP
    demo/         integration-validation client (not a production UI)
    playground/   scaffold for a future interactive developer tool
  packages/
    intelligence-os/            the platform SDK — all business logic
    cognition-contract/         cross-platform HTTP contract types
    shared-intelligence-types/  IntelligenceOS's own domain/event types
  docs/
```

`packages/*` are the platform: reusable SDKs with no knowledge of any
specific host or deployment target. `apps/*` are runtimes: the only place
environment variables, process lifecycle, and deployment configuration
are allowed to live. `apps/* → packages/*` dependencies are allowed;
`packages/* → apps/*` must never happen. See
[`docs/adr/ADR-002-apps-runtime-layer.md`](./docs/adr/ADR-002-apps-runtime-layer.md)
for the full reasoning, and [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
for the deployment flow to the hosted service at
`https://intelligence.saurabhtiwariai.com`.

Package-level documentation lives with each package/app:
- [`packages/intelligence-os/README.md`](./packages/intelligence-os/README.md) — the SDK consumers actually install
- [`packages/shared-intelligence-types/README.md`](./packages/shared-intelligence-types/README.md) — the in-process contract types package
- [`packages/cognition-contract/README.md`](./packages/cognition-contract/README.md) — the cross-platform HTTP contract types package
- [`apps/api/README.md`](./apps/api/README.md) — the deployable runtime, local and Vercel
- [`apps/demo/README.md`](./apps/demo/README.md) — the integration-validation client
- [`apps/playground/README.md`](./apps/playground/README.md) — the developer-playground scaffold

This file intentionally does not restate the architecture document's content — a thin pointer is far less likely to drift out of sync than a second copy of the architecture would be.
