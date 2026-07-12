# @platform/cognition-contract

The system contract between BrandOS (Execution Platform) and IntelligenceOS
(Cognitive Platform). Types only. No runtime logic beyond
`createDegradedCognitionContext`, which is pure data construction.

Governed by, and must stay consistent with:
- `docs/ARCHITECTURE.md`
- `docs/PLATFORM_CONTRACT.md` §3–§5
- `docs/adr/ADR-003-subject-centric-intelligence.md`

## Physical duplication (tracked, temporary)

This package is currently duplicated byte-for-byte in both the `brandos`
and `intelligence-os` repositories, because the two are separate repos with
no shared package registry between them today. **Any change to `src/` must
be applied identically to both copies in the same change set.**

Follow-up (not yet scheduled): publish this package to a real registry
(private npm registry or a git-dependency workspace protocol both repos can
resolve) and delete one of the two copies in favor of a real dependency.
Until then, a CI check comparing the two copies' file hashes is recommended
so drift is caught immediately rather than discovered at integration time.

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

2. **Explicit brand-voice configuration ingestion.** Before this
   migration, BrandOS forwarded a workspace's user-edited persona record
   (brand name, tone override, banned phrases, etc. — from
   `@brandos/auth`'s persona storage) into brand-cognition resolution on
   every request, and it was merged live with learned signals.
   `CognitionRequest` (this package) intentionally carries only
   `workspaceId` and `taskType` — no persona payload — per
   `PLATFORM_CONTRACT.md` §4's exact signature, since
   BrandOS is not supposed to hand IntelligenceOS raw configuration on the
   synchronous read path, and that stays true regardless of how this gap
   closes. **Decided:** explicit, user-set configuration is **Knowledge**,
   not an outcome `observe()` reports and not a payload merged externally —
   see `ADR-003` §2.4. It reaches IntelligenceOS through a narrow ingestion
   path modeled on the existing Knowledge Ingest route, stored with
   provenance the way any other `KnowledgeAsset` is, and read alongside a
   workspace's learned intelligence when `identity`/`voice` are synthesized.
   **Implemented in IntelligenceOS** — `IntelligenceOS.ingestWorkspaceConfiguration()`
   and `context/ContextBuilder.ts`'s explicit-configuration precedence
   over Learning-derived voice. Not yet exposed as a `CognitionProvider`
   HTTP route or a BrandOS-side admin surface — that remains an explicit,
   separate decision (which transport/auth an admin-facing write belongs
   behind), tracked in `IMPLEMENTATION_STATUS.md`.

Gap 1 still needs an explicit decision. Gap 2's decision is recorded in
`ADR-003` and implemented in IntelligenceOS; the BrandOS-side migration in
this change set preserves the mechanical contract exactly as specified in
the meantime and leaves both gaps visible rather than papering over them
with a shadow parameter or an
undocumented sixth method.
