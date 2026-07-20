/**
 * KnowledgeProcessor.ts
 *
 * Orchestrator for the Knowledge Intelligence pipeline.
 *
 * Workflow:
 *   Knowledge Asset (input)
 *         ↓
 *   KnowledgeAssetExtractor   → ExtractionJob (PROCESSING)
 *         ↓
 *   VocabularyExtractor       → VocabularyExtractionResult
 *   FrameworkExtractor        → FrameworkExtractionResult     (parallel)
 *   PatternExtractor          → PatternExtractionResult       (parallel)
 *   VisualFeatureExtractor    → VisualFeatureExtractionResult (parallel, E1-4)
 *         ↓
 *   KnowledgeValidator        → ValidationResult
 *         ↓
 *   persistAsset()            → KnowledgeAsset (persisted)
 *
 * E1-4 addition: VisualFeatureExtractor runs alongside the existing text
 * extractors for visual-typed assets. It is invoked unconditionally and
 * returns an isVisualAsset=false result for non-visual content (no error).
 * The extracted_visual_features column is persisted as a new JSONB column
 * on intelligence.knowledge_assets.
 *
 * Persistence: writes to intelligence.knowledge_assets via
 * KnowledgeIntelligenceDomain.persistExtracted() — this class holds no
 * SupabaseClient of its own. Its read-side dependency (KnowledgeValidator's
 * duplicate/corroboration lookup) similarly goes through
 * KnowledgeIntelligenceDomain.getAssets() rather than a raw query.
 *
 * Completion Mission note (Gap Analysis G-2, resolved this session): prior
 * to this session, this class held its own `SupabaseClient` and wrote to
 * `intelligence.knowledge_assets` directly, bypassing
 * `KnowledgeIntelligenceDomain`, the documented sole owner of that table.
 *
 * Source: BrandOS Sprint 3 spec, Engineering Roadmap E1-4 (corrected design).
 */

import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import type { KnowledgeAssetInput } from '../types/domains';
import type { KnowledgeAsset, KnowledgeAssetOwnerType, KnowledgeAssetType } from '../types/entities';
import type { KnowledgeIntelligenceDomain } from '../domains/KnowledgeIntelligenceDomain';
import type {
  KnowledgeProcessorResult,
  KnowledgeStageError,
  KnowledgeAssetLifecycleState,
} from './types';
import type { VisualFeatureExtractionResult } from './VisualFeatureExtractor';

import { KnowledgeAssetExtractor } from './KnowledgeAssetExtractor';
import { VocabularyExtractor } from './VocabularyExtractor';
import { FrameworkExtractor } from './FrameworkExtractor';
import { PatternExtractor } from './PatternExtractor';
import { VisualFeatureExtractor } from './VisualFeatureExtractor';
import { KnowledgeValidator } from './KnowledgeValidator';

// ── KnowledgeProcessor ────────────────────────────────────────────────────────

export class KnowledgeProcessor {
  private readonly assetExtractor:    KnowledgeAssetExtractor;
  private readonly vocabExtractor:    VocabularyExtractor;
  private readonly frameworkExtractor: FrameworkExtractor;
  private readonly patternExtractor:  PatternExtractor;
  private readonly visualExtractor:   VisualFeatureExtractor;
  private readonly validator:         KnowledgeValidator;
  private readonly logger:            Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(
    private readonly knowledgeDomain: KnowledgeIntelligenceDomain,
    private readonly bus: IntelligenceEventBus,
    /**
     * G-21 (Architecture Verification Report, P0) — instruments the
     * Knowledge Pipeline to the same standard `CognitionProviderImpl`
     * already holds for the Learning Pipeline: an injectable logger
     * (tests can supply a spy), defaulting to `console` so production
     * boots with real output with no extra wiring. Never affects control
     * flow — a logging failure must not fail extraction.
     */
    logger?: Pick<Console, 'info' | 'warn' | 'error'>,
  ) {
    this.assetExtractor     = new KnowledgeAssetExtractor();
    this.vocabExtractor     = new VocabularyExtractor();
    this.frameworkExtractor = new FrameworkExtractor();
    this.patternExtractor   = new PatternExtractor();
    this.visualExtractor    = new VisualFeatureExtractor();
    this.logger             = logger ?? console;

    // Validator consults existing assets for corroboration and duplicate checks.
    this.validator = new KnowledgeValidator(async () => {
      return this.knowledgeDomain.getAssets({ isCurrent: true });
    });
  }

  /**
   * Registers the processor on the event bus.
   * Must be called once during IntelligenceOS initialisation.
   */
  register(): void {
    this.bus.on('intelligence.knowledge_asset.uploaded', async (payload) => {
      // Completion Mission (RCA finding — double-processing / empty-content
      // overwrite): this used to hardcode `''` here, on the assumption that
      // extraction had already happened via a separate direct call in
      // `IntelligenceOS.ingestKnowledgeAsset()`. That direct call has been
      // removed — this handler is now the single place extraction happens,
      // so it must use the real content the event now carries.
      await this.process(
        {
          ownerType:     payload.ownerType as KnowledgeAssetOwnerType,
          userId:        payload.userId ?? null,
          projectId:     payload.projectId ?? null,
          workspaceId:   payload.workspaceId ?? null,
          assetType:     payload.assetType as KnowledgeAssetType,
          title:         payload.title,
          sourceFileRef: payload.sourceFileRef ?? null,
        },
        payload.rawContent ?? '',
        payload.assetId,
      );
    });
  }

  /**
   * Processes a knowledge asset through the full extraction pipeline.
   * Includes visual feature extraction (E1-4) alongside existing text extractors.
   */
  async process(
    input: KnowledgeAssetInput,
    rawContent: string,
    assetId: string,
  ): Promise<KnowledgeProcessorResult> {
    const errors: KnowledgeStageError[] = [];

    // ── Stage 0: Asset extraction (normalization) ──────────────────────────

    let job;
    try {
      job = this.assetExtractor.createJob(input, assetId, rawContent);
    } catch (err) {
      errors.push(stageError('extract', 'Asset extraction failed', err));
      return failedResult(assetId, errors);
    }

    // ── Stages 1–4: Text + visual extractors (parallel) ───────────────────

    let vocabularyResult;
    try {
      vocabularyResult = this.vocabExtractor.extract(job);
    } catch (err) {
      errors.push(stageError('vocabulary', 'Vocabulary extraction failed', err));
      vocabularyResult = { terms: [], phrases: [], termCount: 0, phraseCount: 0 };
    }

    let frameworkResult;
    try {
      frameworkResult = this.frameworkExtractor.extract(job);
    } catch (err) {
      errors.push(stageError('framework', 'Framework extraction failed', err));
      frameworkResult = { frameworks: [], frameworkCount: 0 };
    }

    let patternResult;
    try {
      patternResult = this.patternExtractor.extract(job);
    } catch (err) {
      errors.push(stageError('pattern', 'Pattern extraction failed', err));
      patternResult = { patterns: [], patternCount: 0 };
    }

    // ── Stage 4 (E1-4): Visual feature extraction ──────────────────────────
    // Invoked unconditionally. Returns isVisualAsset=false for non-visual
    // assets — not an error condition, just an empty result.

    let visualResult: VisualFeatureExtractionResult | null = null;
    try {
      const raw = this.visualExtractor.extract(job);
      visualResult = raw.isVisualAsset ? raw : null;
    } catch (err) {
      errors.push(stageError('visual', 'Visual feature extraction failed', err));
      // Non-fatal: null means no visual features persisted
    }

    // ── Stage 5: Validation ───────────────────────────────────────────────

    let validationResult;
    try {
      validationResult = await this.validator.validate(job, vocabularyResult, frameworkResult);
    } catch (err) {
      errors.push(stageError('validation', 'Validation failed', err));
      validationResult = {
        confidence:         0.40,
        isDuplicate:        false,
        duplicateAssetId:   null,
        corroborationScore: 0,
        warnings:           ['Validation stage failed; default confidence applied.'],
        passed:             true,
      };
    }

    // ── Stage 6: Persist ──────────────────────────────────────────────────

    const lifecycleState: KnowledgeAssetLifecycleState =
      validationResult.passed ? 'ACTIVE' : 'EXTRACTED';

    let persistedAsset: KnowledgeAsset;
    try {
      persistedAsset = await this.persistAsset(
        job, vocabularyResult, frameworkResult, patternResult,
        visualResult, validationResult.confidence, lifecycleState,
      );
    } catch (err) {
      errors.push(stageError('persist', 'Asset persistence failed', err));
      persistedAsset = buildSyntheticAsset(
        job, vocabularyResult, frameworkResult, patternResult, visualResult, validationResult.confidence,
      );
    }

    // ── Emit milestone event ──────────────────────────────────────────────

    try {
      await this.bus.emit('intelligence.signal.extracted', {
        userId:        job.userId ?? 'unknown',
        entityId:      assetId,
        entityType:    'knowledge_asset',
        // ADR-004 (Cognitive Consolidation) implementation note: added so
        // FeedbackProcessor's new subscriber (processKnowledgeExtraction())
        // can resolve the correct SubjectRef for a workspace-owned asset —
        // job.ownerType/job.workspaceId were already computed here for
        // persistAsset() above, just not previously forwarded on this
        // event. See CHANGELOG / IMPLEMENTATION_STATUS.md for why this was
        // a gap in the approved blueprint's own File Impact Matrix, not an
        // architectural change to KnowledgeProcessor's responsibilities.
        ownerType:     job.ownerType,
        workspaceId:   job.workspaceId ?? undefined,
        lifecycleState,
        termCount:     vocabularyResult.termCount,
        frameworkCount: frameworkResult.frameworkCount,
        patternCount:  patternResult.patternCount,
        isVisualAsset: visualResult?.isVisualAsset ?? false,
        confidence:    validationResult.confidence,
        occurredAt:    new Date().toISOString(),
      });
    } catch {
      // Non-fatal
    }

    // ── G-21 structured logging ────────────────────────────────────────────
    // Mirrors CognitionProviderImpl's Learning Pipeline standard: one
    // structured line per process() invocation reporting stage-by-stage
    // pass/fail (derived from the `errors` array already collected above —
    // no new computation, per the finding's approach) alongside final
    // lifecycleState/confidence and the extraction counts. Closes RC-5/RC-3
    // for the Knowledge Pipeline specifically, and gives R-P0-1's
    // confirmation trace something concrete to inspect (`knowledge:YES`/
    // `[KnowledgeProcessor]` correlation).
    try {
      const failedStages = new Set(errors.map((e) => e.stage));
      const stageOutcomes: Record<string, 'pass' | 'fail'> = {
        extract:    failedStages.has('extract')    ? 'fail' : 'pass',
        vocabulary: failedStages.has('vocabulary') ? 'fail' : 'pass',
        framework:  failedStages.has('framework')  ? 'fail' : 'pass',
        pattern:    failedStages.has('pattern')    ? 'fail' : 'pass',
        visual:     failedStages.has('visual')     ? 'fail' : 'pass',
        validation: failedStages.has('validation') ? 'fail' : 'pass',
        persist:    failedStages.has('persist')    ? 'fail' : 'pass',
      };

      this.logger.info('[KnowledgeProcessor] process() complete:', {
        assetId,
        lifecycleState,
        confidence:    validationResult.confidence,
        passed:        validationResult.passed,
        stageOutcomes,
        termCount:     vocabularyResult.termCount,
        frameworkCount: frameworkResult.frameworkCount,
        patternCount:  patternResult.patternCount,
        isVisualAsset: visualResult?.isVisualAsset ?? false,
        errorCount:    errors.length,
      });
    } catch {
      // Non-fatal — logging must never fail extraction.
    }

    return {
      assetId,
      lifecycleState,
      asset:            persistedAsset,
      vocabularyResult,
      frameworkResult,
      patternResult,
      visualResult,
      validationResult,
      errors,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async persistAsset(
    job: ReturnType<KnowledgeAssetExtractor['createJob']>,
    vocabulary: import('./types').VocabularyExtractionResult,
    frameworks: import('./types').FrameworkExtractionResult,
    patterns:   import('./types').PatternExtractionResult,
    visual:     VisualFeatureExtractionResult | null,
    confidence: number,
    lifecycleState: KnowledgeAssetLifecycleState,
  ): Promise<KnowledgeAsset> {
    return this.knowledgeDomain.persistExtracted({
      id:                       job.assetId,
      ownerType:                job.ownerType,
      userId:                   job.userId,
      projectId:                job.projectId,
      workspaceId:              job.workspaceId,
      assetType:                job.assetType,
      title:                    job.title,
      sourceFileRef:            null,
      extractedVocabulary:      vocabulary as unknown as Record<string, unknown>,
      extractedFrameworks:      frameworks as unknown as Record<string, unknown>,
      extractedPatterns:        patterns   as unknown as Record<string, unknown>,
      extractedVisualFeatures:  visual     as unknown as Record<string, unknown> | null,
      confidence,
      version:                  1,
      // Completion Mission (RCA finding — compounding factor on the
      // double-processing defect): this was previously hardcoded to
      // `true` regardless of validation outcome, so a failed/low-
      // confidence extraction (e.g. empty content) was just as
      // "authoritative" to `getCurrentAssetsForSubject()` and corroboration
      // lookups as a genuine, validated extraction. A non-ACTIVE
      // lifecycle state (validation failed) should not be current.
      isCurrent:                lifecycleState === 'ACTIVE',
    });
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function stageError(
  stage: KnowledgeStageError['stage'],
  message: string,
  cause?: unknown,
): KnowledgeStageError {
  return { stage, message, cause };
}

function failedResult(
  assetId: string,
  errors: KnowledgeStageError[],
): KnowledgeProcessorResult {
  const now = new Date();
  return {
    assetId,
    lifecycleState: 'UPLOADED',
    asset: {
      id: assetId, ownerType: 'user', userId: null, projectId: null, workspaceId: null,
      assetType: 'reference', title: '', sourceFileRef: null,
      extractedVocabulary: null, extractedPatterns: null, extractedFrameworks: null,
      extractedVisualFeatures: null,
      confidence: 0, version: 1, isCurrent: false,
      createdAt: now, updatedAt: now,
    },
    vocabularyResult:  { terms: [], phrases: [], termCount: 0, phraseCount: 0 },
    frameworkResult:   { frameworks: [], frameworkCount: 0 },
    patternResult:     { patterns: [], patternCount: 0 },
    visualResult:      null,
    validationResult:  { confidence: 0, isDuplicate: false, duplicateAssetId: null, corroborationScore: 0, warnings: [], passed: false },
    errors,
  };
}

function buildSyntheticAsset(
  job: ReturnType<KnowledgeAssetExtractor['createJob']>,
  vocabulary: import('./types').VocabularyExtractionResult,
  frameworks: import('./types').FrameworkExtractionResult,
  patterns:   import('./types').PatternExtractionResult,
  visual:     VisualFeatureExtractionResult | null,
  confidence: number,
): KnowledgeAsset {
  const now = new Date();
  return {
    id:                      job.assetId,
    ownerType:               job.ownerType,
    userId:                  job.userId,
    projectId:               job.projectId,
    workspaceId:             job.workspaceId,
    assetType:               job.assetType,
    title:                   job.title,
    sourceFileRef:           null,
    extractedVocabulary:     vocabulary as unknown as Record<string, unknown>,
    extractedFrameworks:     frameworks as unknown as Record<string, unknown>,
    extractedPatterns:       patterns   as unknown as Record<string, unknown>,
    extractedVisualFeatures: visual     as unknown as Record<string, unknown> | null,
    confidence,
    version:                 1,
    isCurrent:               true,
    createdAt:               now,
    updatedAt:               now,
  };
}
