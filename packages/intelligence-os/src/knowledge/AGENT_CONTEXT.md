# AGENT_CONTEXT.md — `packages/intelligence-os/src/knowledge`

## Purpose

The Knowledge Pipeline: turns an uploaded document (or other knowledge asset) into structured, queryable intelligence — extracted vocabulary, frameworks, structural patterns, and visual features — independent of the Learning Pipeline. This is the newest of the three pipelines in the codebase (referred to as "Sprint 3" / "Onboarding Intelligence" in code comments) and the one most likely to grow next, since it's currently heuristic-only by deliberate, documented design choice.

## Completion Mission update (post-Epic-2 session)

Gap Analysis G-2 resolved for this directory: `KnowledgeProcessor` no longer holds a `SupabaseClient`. It now takes a `KnowledgeIntelligenceDomain` instance and calls a new `persistExtracted()` method for the write (Stage 6), and routes `KnowledgeValidator`'s duplicate/corroboration lookup through `KnowledgeIntelligenceDomain.getAssets({ isCurrent: true })` instead of a raw query. See `docs/IMPLEMENTATION_STATUS.md` for the full session entry. RULE-PIPELINE-NO-DIRECT-DB (`packages/intelligence-os/scripts/check-boundaries.mjs`) now mechanically enforces this — any file under `knowledge/` that imports `@supabase/supabase-js` fails `pnpm check:boundaries`.

Also resolved this session: `POST /v1/knowledge/ingest` (in both `apps/api/src/server.ts` and `apps/api/api/cognition.ts`) now actually reaches this pipeline — previously both host apps omitted `createCognitionHttpServer`'s optional third (`KnowledgeIngestPort`) argument, so the route returned 501 even though this pipeline was fully implemented and already reachable via `IntelligenceOS.ingestKnowledgeAsset()`.

## Responsibilities

| Class | Responsibility |
|---|---|
| `KnowledgeAssetExtractor` | Normalize a raw upload + its declared metadata into an internal `ExtractionJob`. |
| `VocabularyExtractor` | Extract a `VocabularyExtractionResult` (terms, phrasing patterns) from a job — heuristic pattern matching, no LLM call. |
| `FrameworkExtractor` | Extract a `FrameworkExtractionResult` (named methodologies/frameworks referenced in the asset) — same heuristic approach. |
| `PatternExtractor` | Extract a `PatternExtractionResult` (structural patterns — headings, sequencing, recurring sections) — same heuristic approach. |
| `VisualFeatureExtractor` | Extracts color, typography, layout, and mood features from visual knowledge assets (E1-4 — implemented). Wired as Stage 4 in `KnowledgeProcessor`, runs in parallel with the three text extractors. Returns `VisualFeatureExtractionResult` (exported from `@intelligence-os/core`). Non-visual assets return `isVisualAsset: false` without error — the extractor is invoked unconditionally. Phase 1 operates on text-layer signals (hex codes, font declarations, layout keywords) in brand documents; true pixel/image analysis is deferred. Per ADR-001, visual signals belong in the existing six domains as taxonomy values on `Learning` rows, not a seventh domain — visual → Learning promotion (ADR-001 §5) is tracked as remaining work in `IMPLEMENTATION_STATUS.md`. |
| `KnowledgeValidator` | Score overall confidence for the combined extraction result, consulting existing assets (via an injected lookup function) for corroboration/duplicate detection. |
| `KnowledgeProcessor` | The orchestrator. Subscribes to `intelligence.knowledge_asset.uploaded`; runs `createJob` → four extractors (vocabulary, framework, pattern, visual — Stages 1–4, parallel) → `validate` (Stage 5) → `persistAsset` (Stage 6). |

## Allowed dependencies

- `../domains/KnowledgeIntelligenceDomain` (constructor-injected; the only way this directory touches the database — see RULE-PIPELINE-NO-DIRECT-DB above).
- `./types` (knowledge-pipeline-internal: `ExtractionJob`, `KnowledgeProcessorResult`, `KnowledgeStageError`, `KnowledgeAssetLifecycleState`, `VocabularyExtractionResult`, `FrameworkExtractionResult`, `PatternExtractionResult`, `ValidationResult`).
- `../types/entities`, `../types/domains`.
- `../events/IntelligenceEventBus` (`KnowledgeProcessor` only).
- `../errors`.

## Forbidden dependencies

- **`@supabase/supabase-js`, anywhere in this directory.** Mechanically enforced (RULE-PIPELINE-NO-DIRECT-DB). Add a method to `KnowledgeIntelligenceDomain` for any new read/write need.
- **`pipeline/` or `blueprint/` internals.** This pipeline is independent of both — `BlueprintBuilder`/`ProjectContextBuilder` and `NarrativePlanner` *read* its output (via `KnowledgeIntelligenceDomain.getAssets()`), but nothing here should import from either of those directories.
- **An LLM SDK or external API client.** Every extractor here is explicitly heuristic/deterministic by design — see Bootstrap §12. Adding model-based extraction is a real architectural upgrade worth pursuing, but it needs a design decision and almost certainly a new class alongside these rather than a quiet change inside one of them, since the deterministic property is currently relied upon by the test suite and by the "no network access needed to run tests" guarantee.

## Public interfaces

```ts
class KnowledgeAssetExtractor {
  createJob(asset: KnowledgeAssetInput, rawContent: string, assetId: string): ExtractionJob;
}

class VocabularyExtractor {
  extract(job: ExtractionJob): VocabularyExtractionResult;
}

class FrameworkExtractor {
  extract(job: ExtractionJob): FrameworkExtractionResult;
}

class PatternExtractor {
  extract(job: ExtractionJob): PatternExtractionResult;
}

class VisualFeatureExtractor {
  extract(job: ExtractionJob): VisualFeatureExtractionResult;
  // Returns isVisualAsset: false (not an error) for non-visual content.
  // Exported directly from @intelligence-os/core (not from knowledge/index.ts).
}

class KnowledgeValidator {
  constructor(lookupExisting: () => Promise<KnowledgeAsset[]>);
  validate(/* combined extraction results */): Promise<ValidationResult>;
}

class KnowledgeProcessor {
  constructor(knowledgeDomain: KnowledgeIntelligenceDomain, bus: IntelligenceEventBus);
  register(): void; // subscribes to 'intelligence.knowledge_asset.uploaded'
  process(asset: KnowledgeAssetInput, rawContent: string, assetId: string): Promise<KnowledgeProcessorResult>;
}
```

## Common implementation mistakes

- **Reaching for a `SupabaseClient` instead of `KnowledgeIntelligenceDomain.persistExtracted()`.** This was this directory's real architectural debt (Gap Analysis G-2) until this session — `KnowledgeProcessor.persistAsset()` now delegates the write, and RULE-PIPELINE-NO-DIRECT-DB catches a regression automatically. Route any new read/write need through the domain, not a fresh client.
- **Adding an LLM call inside an extractor "just to improve accuracy a bit."** This single-handedly breaks the pipeline's no-network-access testability and its deterministic-output property, both of which are relied on elsewhere (the Bootstrap's Testing Philosophy, the package's own zero-setup test guarantee). If extraction quality is the goal, propose a parallel, explicitly-named LLM-assisted extractor rather than modifying an existing heuristic one in place.
- **Treating `KnowledgeIntelligenceDomain.ingestAsset()` as the entry point for uploads.** It's an intentional stub that throws `PhaseNotImplementedError` by design, not deferred work — the real entry point is `IntelligenceOS.ingestKnowledgeAsset()`, which calls `KnowledgeProcessor.process()` directly, synchronously, in Phase 1, and (as of this session) is also reachable over HTTP via `POST /v1/knowledge/ingest`. Don't "fix" the domain stub without first checking whether doing so duplicates or conflicts with `KnowledgeProcessor`'s existing responsibility — see that method's own docblock in `KnowledgeIntelligenceDomain.ts`.
- **Skipping `KnowledgeValidator` for a fast path.** Even a high-confidence extraction should pass through validation (corroboration/duplicate check against existing assets) before being marked `is_current: true` — don't add a shortcut that persists an asset without it.
- **Implementing visual → Learning promotion inside `VisualFeatureExtractor` directly.** Per ADR-001 §5, visual feature signals should be promoted to Learnings via the same domain-write path as text signals (through `UserIntelligenceDomain.insertLearning()`), not as a side effect inside the extractor itself. That promotion step is currently tracked as remaining work in `IMPLEMENTATION_STATUS.md` — implement it through the Learning Pipeline's existing paths rather than by adding write logic to this pipeline.

## Testing expectations

- `tests/unit/knowledge/` currently covers `KnowledgeAssetExtractor` and a combined `extractors.test.ts` (covering `VocabularyExtractor`/`FrameworkExtractor`/`PatternExtractor` together) plus `knowledge-pipeline.test.ts` for the orchestrated flow. `VisualFeatureExtractor` should be added to `extractors.test.ts` or given its own file — it has distinct conditional behaviour (`isVisualAsset` branching) that warrants its own explicit assertions. A new extractor or a meaningful change to an existing one should get its own test assertions in the matching file — split `extractors.test.ts` into per-class files once any one grows complex enough that "which extractor does this test belong to" stops being obvious at a glance.
- Because every extractor here is deterministic, **tests should assert exact expected output for given input**, not just "returns something non-null." This is the one pipeline in the codebase where exact-match assertions are cheap and valuable — take advantage of that property rather than writing loose shape assertions.
- Any test exercising `KnowledgeProcessor.process()` end-to-end needs the same mocked-Supabase-client pattern used elsewhere (`createMockSupabase`-style) — including a mock for the `KnowledgeValidator`'s injected lookup function, since `KnowledgeProcessor` constructs that closure itself in its constructor.
