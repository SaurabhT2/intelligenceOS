# IntelligenceOS Documentation

This is the full documentation set for IntelligenceOS. If you're new here, read in this order:

1. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — start here, always. Mission, vision, core concepts, repository structure, package responsibilities, the domain model, both pipelines, architectural rules, development workflow, and a full read order through the source code itself.
2. **[`PLATFORM_CONTRACT.md`](./PLATFORM_CONTRACT.md)** — the cross-repository contract between BrandOS and IntelligenceOS: what's actually implemented today, and the target design it's built to grow into.
3. **[`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md)** — if you're building something that calls IntelligenceOS: the two ways to integrate (in-process SDK or HTTP), and a maintained reference of every package's public exports.
4. **[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md)** — current verified state (build, tests, boundary checks), how the repository got here, pending migrations, and known issues / technical debt.
5. **[`ROADMAP.md`](./ROADMAP.md)** — what's planned next, near-term through longer-term.
6. **[`DEPLOYMENT.md`](./DEPLOYMENT.md)** — how `apps/api` gets from source to a running service.
7. **[`adr/`](./adr/)** — architectural decision records, for the specific "why was it decided this way" questions the documents above don't already answer inline.

## Everything else

**[`archive/`](./archive/)** holds historical material — the original specification documents IntelligenceOS was designed from, the roadmaps and implementation guides written while building it, architecture-analysis documents, and superseded status snapshots. None of it is required reading to work in this repository today; see [`archive/README.md`](./archive/README.md) for what's there and why it's kept. If a document anywhere in this repository describes itself as a "historical planning document" or "historical specification document," it lives in `archive/`, not here.

**Per-package and per-app documentation** lives next to the code it describes, not in this directory:
- `packages/intelligence-os/README.md`, `packages/shared-intelligence-types/README.md`, `packages/cognition-contract/README.md`
- `apps/api/README.md`, `apps/demo/README.md`, `apps/playground/README.md`
- `AGENT_CONTEXT.md` files throughout `packages/intelligence-os/src/*` — boundary rules and pitfalls for one specific directory, meant to be read immediately before working in that area (see `ARCHITECTURE.md` §7 for the convention)

## Maintenance

This documentation set is designed to be small enough to keep accurate by hand. When you change something the docs describe:

- **A domain method goes from stub to real, or vice versa** → update `ARCHITECTURE.md` §6's domain table.
- **A package's public exports change** → update `INTEGRATION_GUIDE.md` Part 2. If `index.ts` and that document ever disagree, `index.ts` is correct — fix the document.
- **A version bumps, a test count changes, a known issue gets fixed** → update `IMPLEMENTATION_STATUS.md`. Re-verify against source rather than copying the previous entry forward — see that document's own maintenance note for why this matters.
- **The `CognitionContext`/`CognitionProvider` contract changes** → update `PLATFORM_CONTRACT.md` §3 (current implementation) and, if it's a new capability being designed, check it against §5's evolution rules first.
- **A new architectural decision is made** → add a new ADR under `adr/`, numbered sequentially. Don't rewrite a past ADR's decision record to match current reality if reality has since drifted from it — add a dated addendum instead (see `ADR-002`'s §8 for the pattern), and record the drift in `IMPLEMENTATION_STATUS.md` Known Issues.
- **A document becomes purely historical** — describing intent or planning rather than current behavior — move it into `archive/` and add an entry to `archive/README.md` explaining what it is and why it's kept, rather than leaving it to accumulate alongside current material.
