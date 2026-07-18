/**
 * KnowledgeIntelligenceDomain.ts
 *
 * Owns: intelligence.knowledge_assets
 * No other domain may write to this table.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 4.
 *
 * Sprint 0 scope:
 *   ✓ getAssets()      — real Supabase read (VocabularyDirectives assembly, Sprint 1)
 *   ✓ getAssetById()   — real Supabase read
 *   ✗ ingestAsset()    — intentional stub, NOT the real upload entry point.
 *     `IntelligenceOS.ingestKnowledgeAsset()` → `knowledge/KnowledgeProcessor`
 *     is the real, fully-implemented extraction pipeline entry point; it
 *     does not call this method. This stub exists only to type-check any
 *     future caller that expects a domain-level "bare insert, no
 *     extraction" path, which nothing in the codebase currently needs — see
 *     `knowledge/AGENT_CONTEXT.md`.
 *
 * Completion Mission (post-Epic-2 session — see IMPLEMENTATION_STATUS.md):
 *   ✓ persistExtracted() — real, new. The actual write path used by
 *     `knowledge/KnowledgeProcessor.persistAsset()` after Stage 6
 *     extraction+validation. Un-stubbed per Gap Analysis G-2:
 *     `KnowledgeProcessor` previously held its own `SupabaseClient` and
 *     wrote to `intelligence.knowledge_assets` directly, bypassing this
 *     domain even though it's the documented sole owner of that table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeAsset } from '../types/entities';
import type { KnowledgeAssetInput, KnowledgeAssetFilter, WorkspaceConfigurationInput } from '../types/domains';
import type { SubjectRef } from '../types/subject';
import { DatabaseError, EntityNotFoundError, PhaseNotImplementedError } from '../errors';

/** ADR-003 §2.4 — the stable title `upsertWorkspaceConfiguration()` upserts by, so at most one "current configuration" row exists per workspace. Not user-facing; an internal marker only. */
const WORKSPACE_CONFIG_TITLE = 'Explicit workspace configuration';

// ── Row shape ─────────────────────────────────────────────────────────────────

interface KnowledgeAssetRow {
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
  created_at: string;
  updated_at: string;
}

/**
 * Write payload for `persistExtracted()`. Mirrors `KnowledgeAssetRow` minus
 * the server-generated timestamps; `id` is caller-supplied (the extraction
 * pipeline assigns the asset id up front so it can be referenced in emitted
 * events before persistence completes).
 */
export interface KnowledgeAssetUpsertInput {
  id: string;
  ownerType: string;
  userId: string | null;
  projectId: string | null;
  workspaceId: string | null;
  assetType: string;
  title: string;
  sourceFileRef: string | null;
  extractedVocabulary: Record<string, unknown> | null;
  extractedFrameworks: Record<string, unknown> | null;
  extractedPatterns: Record<string, unknown> | null;
  extractedVisualFeatures: Record<string, unknown> | null;
  confidence: number;
  version: number;
  isCurrent: boolean;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapToKnowledgeAsset(row: KnowledgeAssetRow): KnowledgeAsset {
  return {
    id: row.id,
    ownerType: row.owner_type as KnowledgeAsset['ownerType'],
    userId: row.user_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    assetType: row.asset_type as KnowledgeAsset['assetType'],
    title: row.title,
    sourceFileRef: row.source_file_ref,
    extractedVocabulary: row.extracted_vocabulary,
    extractedPatterns: row.extracted_patterns,
    extractedFrameworks: row.extracted_frameworks,
    extractedVisualFeatures: row.extracted_visual_features ?? null,
    confidence: row.confidence,
    version: row.version,
    isCurrent: row.is_current,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Domain class ──────────────────────────────────────────────────────────────

export class KnowledgeIntelligenceDomain {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Returns knowledge assets matching the given filter.
   * Always filters to is_current = true unless the caller explicitly passes
   * isCurrent: false (needed for version-history tooling, not Blueprint assembly).
   *
   * Called by BlueprintBuilder to assemble VocabularyDirectives (Sprint 1).
   */
  async getAssets(filter: KnowledgeAssetFilter): Promise<KnowledgeAsset[]> {
    let query = this.db
      .schema('intelligence')
      .from('knowledge_assets')
      .select('*')
      .eq('is_current', filter.isCurrent ?? true);

    if (filter.userId) query = query.eq('user_id', filter.userId);
    if (filter.projectId) query = query.eq('project_id', filter.projectId);
    if (filter.workspaceId) query = query.eq('workspace_id', filter.workspaceId);
    if (filter.ownerType) query = query.eq('owner_type', filter.ownerType);
    if (filter.assetType) query = query.eq('asset_type', filter.assetType);

    const { data, error } = await query;
    if (error) throw new DatabaseError('Failed to fetch knowledge assets', error);
    return (data ?? []).map((row: KnowledgeAssetRow) => mapToKnowledgeAsset(row));
  }

  /**
   * ADR-004 (Cognitive Consolidation) §2.1 — Subject-generic counterpart to
   * `getAssets()`, mirroring the `...ForSubject` convention ADR-003
   * established on `UserIntelligenceDomain`. Returns the given Subject's
   * (User or Workspace) current (`isCurrent: true`) knowledge assets —
   * `ProfileBuilder.rebuildForSubject()`'s sole Knowledge read for ADR-004.
   *
   * `knowledge_assets` has no `subject_type` discriminator column (unlike
   * `learnings`/`hypotheses`/`signals`/`profiles` — see `types/subject.ts`'s
   * header comment); it uses `owner_type`/`user_id`/`workspace_id`/
   * `project_id` instead, and `project` is a valid `ownerType` with no
   * `SubjectType` counterpart. This method deliberately only ever maps to
   * `ownerType: 'user'` or `ownerType: 'workspace'` — project-owned assets
   * are out of a Subject's scope by definition (ADR-003 only names User and
   * Workspace as Subjects) and are correctly excluded, not a gap.
   *
   * Delegates to `getAssets()` rather than issuing a second query — no
   * duplicated query logic.
   */
  async getCurrentAssetsForSubject(subject: SubjectRef): Promise<KnowledgeAsset[]> {
    return this.getAssets({
      ownerType: subject.subjectType,
      userId: subject.subjectType === 'user' ? subject.subjectId : undefined,
      workspaceId: subject.subjectType === 'workspace' ? subject.subjectId : undefined,
      isCurrent: true,
    });
  }

  /**
   * Returns a single knowledge asset by id, or null if not found.
   */
  async getAssetById(id: string): Promise<KnowledgeAsset | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('knowledge_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch knowledge asset ${id}`, error);
    return data ? mapToKnowledgeAsset(data as KnowledgeAssetRow) : null;
  }

  /**
   * Returns an asset by id, throwing EntityNotFoundError if it doesn't exist.
   */
  async requireAsset(id: string): Promise<KnowledgeAsset> {
    const asset = await this.getAssetById(id);
    if (!asset) throw new EntityNotFoundError('KnowledgeAsset', id);
    return asset;
  }

  /**
   * Ingests a knowledge asset (upload → extract vocabulary/patterns/frameworks).
   *
   * DEFERRED — extraction pipeline (Sprint 3, Onboarding Intelligence).
   * A record can be persisted without extraction, but the extracted_* fields
   * require the Knowledge Asset Extractor which is a Sprint 3 component.
   */
  async ingestAsset(_input: KnowledgeAssetInput): Promise<string> {
    throw new PhaseNotImplementedError(
      'KnowledgeIntelligenceDomain.ingestAsset',
      'Sprint 3 (Onboarding Intelligence)',
    );
  }

  /**
   * Persists a fully-extracted knowledge asset (upsert by id). This is the
   * real write path for the Knowledge Pipeline — called by
   * `knowledge/KnowledgeProcessor.persistAsset()` after Stages 1–5
   * (extraction + validation) have produced the vocabulary/frameworks/
   * patterns/visual-features payload and a confidence score.
   */
  async persistExtracted(input: KnowledgeAssetUpsertInput): Promise<KnowledgeAsset> {
    const row = {
      id:                        input.id,
      owner_type:                input.ownerType,
      user_id:                   input.userId,
      project_id:                input.projectId,
      workspace_id:              input.workspaceId,
      asset_type:                input.assetType,
      title:                     input.title,
      source_file_ref:           input.sourceFileRef,
      extracted_vocabulary:      input.extractedVocabulary,
      extracted_frameworks:      input.extractedFrameworks,
      extracted_patterns:        input.extractedPatterns,
      extracted_visual_features: input.extractedVisualFeatures,
      confidence:                input.confidence,
      version:                   input.version,
      is_current:                input.isCurrent,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('knowledge_assets')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new DatabaseError('Failed to persist knowledge asset', error);
    return mapToKnowledgeAsset(data as KnowledgeAssetRow);
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) §2.4 — persists explicit,
   * admin-declared workspace configuration (a persona/brand-voice
   * override, compliance requirements) as a `KnowledgeAsset`
   * (`ownerType: 'workspace'`, `assetType: 'reference'`), not a `Learning`.
   *
   * Reuses `persistExtracted()` — the same real write path
   * `knowledge/KnowledgeProcessor` already uses — rather than a second
   * write path into the same table this domain owns (Rule 1: one domain,
   * one writer, and within that, one write method per shape of data being
   * written). The only new decision this method makes is *which* asset id
   * to upsert: at most one "current configuration" knowledge asset is
   * maintained per workspace (found by `WORKSPACE_CONFIG_TITLE` + owner
   * filters), so re-ingesting configuration for the same workspace updates
   * that one row in place rather than accumulating a new row per admin
   * edit — a declared configuration has one current value, not a history
   * of Learning-style corroborated versions.
   *
   * `confidence: 1.0` — an explicit admin declaration doesn't need
   * corroboration to be trusted; it needs provenance, which `KnowledgeAsset`
   * already carries (`sourceFileRef` — here, `null`, since this is a
   * direct API declaration, not an uploaded document) and a `Learning`
   * does not model at all.
   *
   * Returns the persisted asset's id.
   */
  async upsertWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string> {
    const existing = await this.getAssets({
      workspaceId: input.workspaceId,
      ownerType: 'workspace',
      assetType: 'reference',
    });
    const currentConfig = existing.find(a => a.title === WORKSPACE_CONFIG_TITLE);

    const extractedFrameworks: Record<string, unknown> = {};
    if (input.complianceConstraints) extractedFrameworks['complianceConstraints'] = input.complianceConstraints;
    if (input.voiceConfiguration) extractedFrameworks['voiceConfiguration'] = input.voiceConfiguration;
    // ADR-003 §2.3/§2.4 — closes Completion Mission audit finding D-3
    // (identity synthesis had no Knowledge-sourced input). Written into
    // the same extracted_frameworks JSON blob, read back by
    // WorkspaceIntelligenceDomain.getContext() the same way
    // voiceConfiguration already is.
    if (input.identityConfiguration) extractedFrameworks['identityConfiguration'] = input.identityConfiguration;
    if (input.label) extractedFrameworks['label'] = input.label;

    const asset = await this.persistExtracted({
      id: currentConfig?.id ?? crypto.randomUUID(),
      ownerType: 'workspace',
      userId: null,
      projectId: null,
      workspaceId: input.workspaceId,
      assetType: 'reference',
      title: WORKSPACE_CONFIG_TITLE,
      sourceFileRef: null,
      extractedVocabulary: null,
      extractedFrameworks,
      extractedPatterns: null,
      extractedVisualFeatures: null,
      confidence: 1.0,
      version: (currentConfig?.version ?? 0) + 1,
      isCurrent: true,
    });

    return asset.id;
  }
}
