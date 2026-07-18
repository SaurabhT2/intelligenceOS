# @platform/cognition-contract

The system contract between BrandOS (Execution Platform) and IntelligenceOS
(Cognitive Platform). Types only. No runtime logic beyond
`createDegradedCognitionContext`, which is pure data construction.

Governed by, and must stay consistent with:
- `docs/ARCHITECTURE.md`
- `docs/PLATFORM_CONTRACT.md` §3–§5
- `docs/adr/ADR-003-subject-centric-intelligence.md`
- `docs/adr/ADR-004-cognitive-consolidation.md` — added `knowledge`/`reasoning`/`positioning` to `CognitionContext` (contract version `1.0.0` → `1.1.0`, additive)

## Physical duplication (tracked, temporary)

This package is currently duplicated byte-for-byte in both the `brandos`
and `intelligence-os` repositories, because the two are separate repos with
no shared package registry between them today. **Any change to `src/` must
be applied identically to both copies in the same change set.** ADR-004's
`CognitionContext` changes were made in this repository's copy only — the
`brandos`-side copy is outside this repository's reach and needs the
identical change applied separately, per this section's own rule.

Follow-up (not yet scheduled): publish this package to a real registry
(private npm registry or a git-dependency workspace protocol both repos can
resolve) and delete one of the two copies in favor of a real dependency.
That requires provisioning a private package registry, which is an
infrastructure/ops decision outside a code change to this package.

**Until then (Cognitive Platform Evolution Program, EM-1.1):**
`scripts/check-contract-parity.mjs` is a real, runnable symbol-level diff
against the sibling repository's copy (mirrors `brandos`'s copy of the same
script), wired into CI via `.github/workflows/contract-parity.yml` (see
that file's comments for the placeholder repo slug / token it still needs).
It does not require byte-for-byte identity — see
`contract-parity.allowlist.json` for the one currently-known, deliberate
exception (BrandOS's Option B) — but it fails the build on anything else,
including the exact kind of drift (this file's ADR-004 fields silently
missing from BrandOS's copy) that the audit preceding this program had to
catch by hand.

## Subject scope (read this before assuming a contract change is needed)

`CognitionRequest` scopes every operation to a workspace (`workspaceId`) and
carries no user identifier. This is deliberate and is not, by itself, a
reason identity or voice can't resolve for a workspace: IntelligenceOS
treats the workspace itself as a first-class **Subject**, synthesizing its
`identity`/`voice` from its own accumulated intelligence server-side, the
same way it already does for a user — not by requiring the caller to supply
or point at identity content. See
`docs/adr/ADR-003-subject-centric-intelligence.md` for the full model.
`CognitionContext.identity` is now synthesized from the workspace's own
accumulated Knowledge/Experience (`context/identitySynthesis.ts`) — it
resolves to `null` only when a workspace genuinely has no
identity-relevant Learnings yet (the honest "nothing learned yet" state),
not because the synthesis path is unbuilt. It does not need, and will
never need, a `userId` field added to unlock it. That specific shortcut
was considered and rejected; see `ADR-003` §5.

## Known contract gaps (require an explicit decision — not resolved here)

These were discovered while migrating BrandOS's existing brand-intelligence
package onto this contract. Neither is a blocking technical constraint —
both are product-surface conflicts between existing BrandOS behavior and
the architecture documents' exclusion rules. Flagging per the
"stop and explain, don't invent" instruction rather than deciding
unilaterally. Gap 1 still needs a decision; gap 2's direction is decided
(`ADR-003`) but not yet implemented:

1. **Raw-signal review UI.** BrandOS's `/workspace/brand` page lists
   individual pending memory signals (id, classification, confidence,
   content) for human approve/reject. `CognitionProvider` has no read
   operation that returns a list of raw or reviewable signals — by design,
   per `PLATFORM_CONTRACT.md` §4's exclusion of raw/unconsolidated
   signals from anything BrandOS can see. `review()` can still *act* on an
   entry by its opaque id, but nothing in the current contract can populate
   the list this page renders. Needs an explicit decision: extend the
   contract with a narrowly scoped, already-summarized "reviewable items"
   read (still no raw content, e.g. classification + confidence + a
   pre-rendered display string), or change the product surface.

2. ~~**Explicit brand-voice configuration ingestion.**~~ **RESOLVED**
   (Cognitive Platform Evolution Program, Milestone 1 / EM-1.2). Decided in
   `ADR-003` §2.4: explicit, user-set configuration is **Knowledge**, not an
   outcome `observe()` reports. `IntelligenceOS.ingestWorkspaceConfiguration()`
   and `context/ContextBuilder.ts`'s explicit-configuration precedence over
   Learning-derived voice were already implemented here; `POST
   /v1/workspace-configuration` was already wired in both HTTP deployment
   targets (`apps/api/src/server.ts`, `apps/api/api/cognition.ts`) — the
   previous version of this note said otherwise, which was stale relative
   to the code, not an accurate account of a remaining gap. What was
   actually missing was a BrandOS-side caller, which now exists
   (`@brandos/cognition-client`'s `WorkspaceConfigurationClient`, called
   from `@brandos/auth`'s persona write path). End to end: a persona edit
   in BrandOS now reaches this endpoint in the same request cycle.

Gap 1 still needs an explicit decision — see the Cognitive Platform
Evolution Program, Milestone 4, EM-4.5, which surfaces it again but does
not resolve it unilaterally. Gap 2 is closed.
