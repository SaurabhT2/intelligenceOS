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
 *   ✗ ingestAsset()    — stub (Sprint 3 — extraction pipeline required)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeAsset } from '../types/entities';
import type { KnowledgeAssetInput, KnowledgeAssetFilter } from '../types/domains';
import { DatabaseError, EntityNotFoundError, PhaseNotImplementedError } from '../errors';

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
  confidence: number;
  version: number;
  is_current: boolean;
  created_at: string;
  updated_at: string;
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
    extractedVisualFeatures: (row as { extracted_visual_features?: Record<string, unknown> | null }).extracted_visual_features ?? null,
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
}
