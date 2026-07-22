# ADR-005 — Evidence/Identity Bridge: Knowledge → Evidence → Hypothesis → Learning → Identity

**Status:** Implemented
**Decision:** Added a source-agnostic Stage 1 evidence layer (`EvidenceExtractor` +
`EvidenceSourceInput`) that lets Knowledge — starting with uploaded documents, via
`KnowledgeAssetEvidenceAdapter` — feed the *existing, unmodified* Signal → Observation →
Hypothesis → Learning pipeline, so that identity-relevant taxonomy categories
(`intellectual_frameworks`, `strategic_thinking_patterns`, `professional_identity`,
`personal_brand_signal`) can accumulate corroborating evidence from documents the same way they
already accumulate it from artifact feedback. `identitySynthesis.ts`'s existing
`deriveIdentityContribution()` — which reads only promoted `Learning`s in those categories — is
unchanged; it simply now has data to read once enough evidence has accumulated. No new promotion
math, no Knowledge → Learning shortcut, no new confidence-ceiling tier.

---

## 1. Context

Runtime investigation (see repository issue thread / RCA report attached to this PR) traced a
reported defect — "IntelligenceOS ingests knowledge but workspace intelligence never evolves;
`PromptCompiler` always reports `identity:NO`" — to its root cause: `identitySynthesis.ts`'s
`deriveIdentityContribution()` reads exclusively from promoted `Learning` rows in four taxonomy
categories, and **nothing in the codebase ever created a Learning — or even a Hypothesis — from a
knowledge asset's extracted content.** Uploaded documents reached `ProfileBuilder`'s descriptive
`knowledgeSummary`/`vocabularySnapshot`/expertise fields directly (`processKnowledgeExtraction()`,
pre-existing), but never touched Stage 1 of the Learning Pipeline at all. Meanwhile,
`VocabularyExtractor` and `FrameworkExtractor` (Knowledge Pipeline, pre-existing) already tag every
extracted term/phrase/framework with a `taxonomyCategory` — including the exact four categories
`identitySynthesis.ts` reads — and `SOURCE_QUALITY_CEILING` already defines an `'uploaded_artifact'`
tier (0.90 ceiling). The classification and quality-tiering work existed; only the bridge
connecting it to Stage 1 did not.

## 2. Problem

A naive fix — promote a knowledge asset's extracted frameworks directly to a Learning — was
considered and explicitly rejected during design review. It would have:

- Let a single uploaded document unilaterally become "workspace identity," bypassing every
  corroboration/confidence gate every other Learning in the system goes through (Schema D.1
  Stages 3–5), and reintroducing exactly the kind of Knowledge/Experience-boundary violation
  ADR-004 §0.1 already drew a hard line against for `positioning`.
- Collapsed two architecturally distinct concepts the review explicitly wanted to keep separate:
  **descriptive** synthesis (what a workspace's current documents say — reflects the latest
  upload immediately, no corroboration, lives in `knowledgeSummary`/`vocabularySnapshot`) and
  **evidentiary** synthesis (what a workspace has been shown, repeatedly, across sources and time
  — corroborated, decays, lives in `Learning`/identity). Identity belongs to the second category
  by design (`identitySynthesis.ts` reads Learnings, not KnowledgeAssets, and always has).
- Hard-coded "evidence == an uploaded document" into the fix, requiring a second, parallel
  mechanism the day a connector, web import, repository, or conversation needed to contribute
  evidence too.

## 3. Decision

1. **A new, source-agnostic Stage 1 producer: `EvidenceExtractor`.** Takes an `EvidenceSourceInput`
   envelope (`sourceKind`, `sourceId`, `sourceLabel?`, `subject`, `candidates: EvidenceCandidate[]`)
   and applies a single evidence-quality gate — `confidence ≥ 0.5` AND (`≥ 2` supporting items OR
   `confidence ≥ 0.75`) — before emitting `Signal[]` with `sourceType: 'uploaded_artifact'` (or
   whatever `SOURCE_KIND_TO_SIGNAL_TYPE` maps a given `sourceKind` to). `sourceKind` is an open set
   (`knowledge_asset | connector | web_import | repository | conversation | experience`); adding a
   new evidence origin is a new adapter file plus one new enum value, not a change to this class.

2. **Exactly one producer today: `KnowledgeAssetEvidenceAdapter`.** The only Knowledge-specific
   file in the bridge. Converts `FrameworkExtractionResult`/`VocabularyExtractionResult` into
   `EvidenceCandidate[]`, reusing extraction's own pre-existing `taxonomyCategory` tagging
   (`VocabularyExtractor.mapToTaxonomy`) and `FrameworkExtractor`'s `category` field (reusing
   `ProfileBuilder.reasoningSummary`'s existing `analytical`/`evaluative` → strategic-thinking
   classification, rather than inventing a new one). Explicitly excludes `competitive_intelligence`
   (ADR-004 §0.1) and every non-identity-relevant vocabulary category — those remain
   descriptive-only, unchanged, to avoid the same document's content being counted twice as two
   independent kinds of proof.

3. **Every downstream stage is unmodified.** The Signals `EvidenceExtractor` produces flow through
   the *exact same* `ObservationBuilder.build()` → `HypothesisEngine.process()` →
   `LearningValidator.evaluate()` used by every other source. `HypothesisEngine` matches
   Hypotheses purely on `(subject, taxonomyCategory, contextScope)` — a Hypothesis started by one
   document's evidence corroborates with a second document's evidence, or with an
   Experience-sourced observation in the same category, automatically, with zero new matching
   logic. Required-corroboration thresholds per stability class (`permanent: 2, long_term: 3,
   medium_term: 2`) are untouched.

4. **Full auditability (`evidence_trail`).** A new, additive `hypotheses.evidence_trail jsonb`
   column (migration 007) accumulates one `EvidenceRecord` per Observation applied to a
   Hypothesis — `sourceKind`, `sourceId`, `sourceLabel`, `supportingItems`, `confidence`,
   `disposition`, `observedAt` — regardless of source (a minimal fallback record is synthesized
   for pre-existing Experience-side Observations that don't supply one, so the trail is uniformly
   populated, not knowledge-only). Copied verbatim into `Learning.sourceSummary.evidenceTrail` on
   promotion, so a promoted identity trait remains traceable to the specific documents/frameworks/
   vocabulary/observations that produced it, and at what confidence each contributed — not just a
   corroboration count.

5. **New `FeedbackProcessor` entry point: `processKnowledgeEvidence()`.** Wired onto the existing
   `intelligence.signal.extracted` (`entityType: 'knowledge_asset'`) event, alongside (not instead
   of) the pre-existing `processKnowledgeExtraction()` — two independent calls from the same
   handler, one descriptive, one evidentiary, kept visibly separate in the wiring itself.

## 4. Architecture

```
KnowledgeProcessor.process()
   │
   ├─▶ persist KnowledgeAsset (unchanged)
   │
   └─▶ emit intelligence.signal.extracted
        {entityType:'knowledge_asset', extractedFrameworks, extractedVocabulary, title, ...}
              │
              ▼
   FeedbackProcessor (existing subscriber, now calls two handlers)
        │
        ├─▶ processKnowledgeExtraction()          [UNCHANGED — descriptive path]
        │      └─▶ ProfileBuilder.shouldRebuildForSubjectFromKnowledge (5-min debounce)
        │             └─▶ rebuildForSubject() → knowledgeSummary / vocabularySnapshot / expertise
        │
        └─▶ processKnowledgeEvidence()             [NEW — evidentiary path]
               └─▶ KnowledgeAssetEvidenceAdapter.buildKnowledgeAssetEvidenceInput()
                      └─▶ EvidenceExtractor.extract() → Signal[] (sourceType: uploaded_artifact)
                             └─▶ ObservationBuilder.build()        [UNCHANGED]
                                    └─▶ HypothesisEngine.process()  [UNCHANGED promotion math;
                                        │                            additive evidence_trail]
                                        │   (accumulates corroboration with OTHER documents AND
                                        │    with Experience-side observations, same category)
                                        ▼
                                    LearningValidator.evaluate()    [UNCHANGED promotion math;
                                        │                            copies evidence_trail →
                                        │                            sourceSummary on promotion]
                                        ▼
                                    ProfileBuilder.shouldRebuildForSubject/rebuildForSubject [UNCHANGED]
                                        ▼
                                    identitySynthesis.deriveIdentityContribution() [UNCHANGED —
                                                                                     now has data]
                                        ▼
                                    CognitionContext.identity populated
                                        ▼
                                    PromptCompiler → identity:YES
```

A future evidence source (e.g. a CRM connector surfacing an explicit "About Us" positioning
statement) adds: one new `EvidenceSourceKind` value, one new adapter file producing
`EvidenceSourceInput`, one new call site emitting into `FeedbackProcessor` (or a new
`process*Evidence()` method following `processKnowledgeEvidence()`'s shape). `EvidenceExtractor`,
`ObservationBuilder`, `HypothesisEngine`, `LearningValidator`, `ProfileBuilder`, and
`identitySynthesis.ts` all require zero changes.

## 5. Alternatives Considered

- **Direct Knowledge → Learning promotion (rejected).** See §2 — bypasses every corroboration
  gate, collapses the descriptive/evidentiary boundary, single document becomes identity.
- **A Knowledge-specific Stage 1 (`KnowledgeEvidenceExtractor` taking a `KnowledgeAsset` directly)
  (rejected, superseded during design review).** Works for the immediate case but hard-codes
  "evidence == uploaded document" into the Stage 1 contract; every future evidence source would
  need its own parallel Stage-1-through-6 wiring. Superseded by the source-agnostic
  `EvidenceExtractor` + adapter split in this ADR.
- **Confidence-only explainability (no `evidence_trail`) (rejected).** A promoted Learning's
  `confidence` float alone cannot answer "which documents contributed" or "why was this trait
  created" — required by this ADR's explainability requirement. The trail is additive-only and
  does not participate in any promotion decision, so it carries no risk to existing math.
- **Route ALL knowledge-extracted vocabulary/framework taxonomy categories into evidence, not just
  the four identity-relevant ones (rejected).** Would double-count content already reflected
  immediately and descriptively in `vocabularySnapshot`/`knowledgeSummary` as if it were also
  independent corroborating proof. Scope is deliberately limited to categories
  `identitySynthesis.ts` actually reads.

## 6. Consequences

- A workspace's identity now evolves from accumulated document + feedback evidence, per the
  original architectural expectation, without any single upload being able to set it unilaterally.
- Every Hypothesis and promoted Learning — regardless of originating pipeline — now carries a full,
  inspectable evidence trail; this is a strict audit-surface improvement with no change to existing
  read/write shapes other than the additive column and additive `sourceSummary` key.
- `KnowledgeProcessor`'s milestone event payload is now slightly larger (forwards
  `extractedFrameworks`/`extractedVocabulary`/`title`) — the event's declared shape was already an
  open, extensible bag for this reason; no consumer that ignores unknown keys is affected.
- Two independent Knowledge-triggered paths now run per upload instead of one (descriptive +
  evidentiary). Each fails independently and non-fatally (matches `processKnowledgeExtraction()`'s
  existing best-effort convention) — a failure in one never blocks the other.
- Future evidence sources (connectors, web imports, repositories, conversations) have a defined,
  minimal integration point (one adapter file) rather than requiring a new architectural decision.

## 7. Migration Strategy

Migration `007_evidence_provenance.sql` — additive `evidence_trail jsonb not null default
'[]'::jsonb` on `intelligence.hypotheses`. No backfill: pre-existing hypotheses simply have an
empty trail (honest — there is no retroactive provenance to backfill). No existing column, index,
or constraint changes. Deployable independently of the application-layer change (an
`evidence_trail`-unaware application version continues to operate against the new schema
unchanged, since the column has a default and nothing reads it until this ADR's application code
ships).

## 8. Repository Impact

IntelligenceOS only. BrandOS (`PromptCompiler`, `IdentityContributor`, `ContractAssembler`) requires
**zero changes** — `identitySynthesis.ts`'s existing contract to `CognitionContext.identity` is
unchanged; BrandOS simply starts receiving non-null identity once enough evidence has accumulated
for a given workspace.
