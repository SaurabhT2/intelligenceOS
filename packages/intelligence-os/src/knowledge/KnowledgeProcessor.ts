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
 * Source: BrandOS Sprint 3 spec, Engineering Roadmap E1-4 (corrected design).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import type { KnowledgeAssetInput } from '../types/domains';
import type { KnowledgeAsset, KnowledgeAssetOwnerType, KnowledgeAssetType } from '../types/entities';
import type { KnowledgeAssetPayload } from '../types/events';
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
import { DatabaseError } from '../errors';

// ── Row shape for persistence ─────────────────────────────────────────────────

interface KnowledgeAssetUpsertRow {
  id: string;
  owner_type: string;
  user_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
  asset_type: string;
  title: string;
  source_file_ref: string | null;
  extracted_vocabulary: Record<string, unknown> | null;
  extracted_patterns: Record<string, unknown> | null;
  extracted_frameworks: Record<string, unknown> | null;
  extracted_visual_features: Record<string, unknown> | null;
  confidence: number;
  version: number;
  is_current: boolean;
}

// ── KnowledgeProcessor ────────────────────────────────────────────────────────

export class KnowledgeProcessor {
  private readonly assetExtractor:    KnowledgeAssetExtractor;
  private readonly vocabExtractor:    VocabularyExtractor;
  private readonly frameworkExtractor: FrameworkExtractor;
  private readonly patternExtractor:  PatternExtractor;
  private readonly visualExtractor:   VisualFeatureExtractor;
  private readonly validator:         KnowledgeValidator;

  constructor(
    private readonly db:  SupabaseClient,
    private readonly bus: IntelligenceEventBus,
  ) {
    this.assetExtractor     = new KnowledgeAssetExtractor();
    this.vocabExtractor     = new VocabularyExtractor();
    this.frameworkExtractor = new FrameworkExtractor();
    this.patternExtractor   = new PatternExtractor();
    this.visualExtractor    = new VisualFeatureExtractor();

    // Validator consults existing assets for corroboration and duplicate checks.
    this.validator = new KnowledgeValidator(async () => {
      const { data } = await this.db
        .schema('intelligence')
        .from('knowledge_assets')
        .select('*')
        .eq('is_current', true);
      return (data ?? []) as KnowledgeAsset[];
    });
  }

  /**
   * Registers the processor on the event bus.
   * Must be called once during IntelligenceOS initialisation.
   */
  register(): void {
    this.bus.on('intelligence.knowledge_asset.uploaded', async (payload) => {
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
        '',
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
    _lifecycleState: KnowledgeAssetLifecycleState,
  ): Promise<KnowledgeAsset> {
    const row: KnowledgeAssetUpsertRow = {
      id:                       job.assetId,
      owner_type:               job.ownerType,
      user_id:                  job.userId,
      project_id:               job.projectId,
      workspace_id:             job.workspaceId,
      asset_type:               job.assetType,
      title:                    job.title,
      source_file_ref:          null,
      extracted_vocabulary:     vocabulary as unknown as Record<string, unknown>,
      extracted_frameworks:     frameworks as unknown as Record<string, unknown>,
      extracted_patterns:       patterns   as unknown as Record<string, unknown>,
      extracted_visual_features: visual    as unknown as Record<string, unknown> | null,
      confidence,
      version:                  1,
      is_current:               true,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('knowledge_assets')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new DatabaseError('Failed to persist knowledge asset', error);

    const r = data as {
      id: string; owner_type: string; user_id: string | null;
      project_id: string | null; workspace_id: string | null;
      asset_type: string; title: string; source_file_ref: string | null;
      extracted_vocabulary: Record<string, unknown> | null;
      extracted_patterns: Record<string, unknown> | null;
      extracted_frameworks: Record<string, unknown> | null;
      extracted_visual_features: Record<string, unknown> | null;
      confidence: number; version: number; is_current: boolean;
      created_at: string; updated_at: string;
    };

    return {
      id:                      r.id,
      ownerType:               r.owner_type as KnowledgeAsset['ownerType'],
      userId:                  r.user_id,
      projectId:               r.project_id,
      workspaceId:             r.workspace_id,
      assetType:               r.asset_type as KnowledgeAsset['assetType'],
      title:                   r.title,
      sourceFileRef:           r.source_file_ref,
      extractedVocabulary:     r.extracted_vocabulary,
      extractedPatterns:       r.extracted_patterns,
      extractedFrameworks:     r.extracted_frameworks,
      extractedVisualFeatures: r.extracted_visual_features,
      confidence:              r.confidence,
      version:                 r.version,
      isCurrent:               r.is_current,
      createdAt:               new Date(r.created_at),
      updatedAt:               new Date(r.updated_at),
    };
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
