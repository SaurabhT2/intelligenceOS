/**
 * ArtifactIntelligenceDomain.ts
 *
 * Owns: intelligence.artifact_patterns, intelligence.artifact_exemplars,
 *       intelligence.feedback_events, intelligence.artifact_blueprints
 *
 * No other domain may write to these tables.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 4.
 *
 * Sprint 0 scope:
 *   ✓ getPattern()           — real Supabase read (StructurePlanner calls this in Sprint 1)
 *   ✓ recordFeedbackEvent()  — real Supabase write (needed for root class Sprint 0)
 *   ✗ promoteExemplar()      — stub (Sprint 3 — Exemplar promotion logic)
 *   ✗ persistBlueprint()     — stub (Sprint 1 — BlueprintBuilder calls this)
 *   ✗ updatePatternFromExemplar() — stub (Sprint 3 — user-calibrated pattern upgrade)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactPattern, ArtifactExemplar, FeedbackEventRecord } from '../types/entities';
import type { ArtifactExemplarInput } from '../types/domains';
import type { FeedbackEvent } from '@intelligence-os/shared-types';
import type { ArtifactBlueprint } from '@intelligence-os/shared-types';
import { DatabaseError, PhaseNotImplementedError, ValidationError } from '../errors';

// ── Row shapes ────────────────────────────────────────────────────────────────

interface ArtifactPatternRow {
  id: string;
  artifact_type: string;
  pattern_level: string;
  user_id: string | null;
  archetype_type: string | null;
  confidence: number;
  sections: Record<string, unknown>;
  narrative_model: Record<string, unknown>;
  length_baseline: Record<string, unknown> | null;
  tone_model: Record<string, unknown> | null;
  exemplar_count: number;
  known_rejection_triggers: unknown[];
  created_at: string;
  updated_at: string;
}

interface FeedbackEventRow {
  id: string;
  user_id: string;
  artifact_id: string;
  artifact_type: string;
  project_id: string | null;
  event_type: string;
  edit_diff: Record<string, unknown> | null;
  explicit_reason: string | null;
  signals_extracted: boolean;
  blueprint_ref: string | null;
  created_at: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapToArtifactPattern(row: ArtifactPatternRow): ArtifactPattern {
  return {
    id: row.id,
    artifactType: row.artifact_type,
    patternLevel: row.pattern_level as ArtifactPattern['patternLevel'],
    userId: row.user_id,
    archetypeType: row.archetype_type,
    confidence: row.confidence,
    sections: row.sections,
    narrativeModel: row.narrative_model,
    lengthBaseline: row.length_baseline,
    toneModel: row.tone_model,
    exemplarCount: row.exemplar_count,
    knownRejectionTriggers: row.known_rejection_triggers,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToFeedbackEventRecord(row: FeedbackEventRow): FeedbackEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    artifactId: row.artifact_id,
    artifactType: row.artifact_type,
    projectId: row.project_id,
    eventType: row.event_type as FeedbackEventRecord['eventType'],
    editDiff: row.edit_diff,
    explicitReason: row.explicit_reason,
    signalsExtracted: row.signals_extracted,
    blueprintRef: row.blueprint_ref,
    createdAt: new Date(row.created_at),
  };
}

// ── Domain class ──────────────────────────────────────────────────────────────

export class ArtifactIntelligenceDomain {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Loads the best available artifact pattern for a given type.
   *
   * Priority (Scope Rule, Contracts A.2):
   *   1. user_calibrated — if userId provided and a calibrated pattern exists
   *   2. archetype — if archetypeType provided and a pattern exists
   *   3. universal — the seeded baseline (always present post-Sprint 0 seed)
   *
   * Returns null only if no pattern of any level exists for this artifact type.
   * In practice, Sprint 0 seeds all 5 core artifact types at universal level
   * so this will return null only for non-seeded custom artifact types.
   */
  async getPattern(
    artifactType: string,
    userId?: string,
    archetypeType?: string,
  ): Promise<ArtifactPattern | null> {
    // Fetch all candidate patterns for this artifact type in one query,
    // then apply the Scope Rule in application code (avoids 3 round-trips).
    const { data, error } = await this.db
      .schema('intelligence')
      .from('artifact_patterns')
      .select('*')
      .eq('artifact_type', artifactType)
      .order('confidence', { ascending: false });

    if (error) throw new DatabaseError(`Failed to fetch patterns for artifact type ${artifactType}`, error);
    if (!data || data.length === 0) return null;

    const rows = data as ArtifactPatternRow[];

    // 1. User-calibrated (highest specificity)
    if (userId) {
      const userPattern = rows.find(r => r.pattern_level === 'user_calibrated' && r.user_id === userId);
      if (userPattern) return mapToArtifactPattern(userPattern);
    }

    // 2. Archetype-level
    if (archetypeType) {
      const archetypePattern = rows.find(r => r.pattern_level === 'archetype' && r.archetype_type === archetypeType);
      if (archetypePattern) return mapToArtifactPattern(archetypePattern);
    }

    // 3. Universal (seeded baseline)
    const universal = rows.find(r => r.pattern_level === 'universal');
    return universal ? mapToArtifactPattern(universal) : null;
  }

  /**
   * Persists a FeedbackEvent from BrandOS to intelligence.feedback_events.
   * Returns the persisted record.
   *
   * This is the only write path called from IntelligenceOS.recordFeedbackEvent()
   * in Sprint 0. Signal extraction (Sprint 2) sets signals_extracted = true
   * later when it processes the row.
   */
  async recordFeedbackEvent(event: FeedbackEvent): Promise<FeedbackEventRecord> {
    if (!event.userId) throw new ValidationError('FeedbackEvent.userId is required', 'userId');
    if (!event.artifactId) throw new ValidationError('FeedbackEvent.artifactId is required', 'artifactId');
    if (!event.artifactType) throw new ValidationError('FeedbackEvent.artifactType is required', 'artifactType');

    const payload = {
      user_id: event.userId,
      artifact_id: event.artifactId,
      artifact_type: event.artifactType,
      project_id: event.projectId ?? null,
      event_type: event.eventType,
      edit_diff: event.editDiff ?? null,
      explicit_reason: event.explicitReason ?? null,
      signals_extracted: false,
      blueprint_ref: event.blueprintId ?? null,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('feedback_events')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new DatabaseError('Failed to persist feedback event', error);
    return mapToFeedbackEventRecord(data as FeedbackEventRow);
  }

  /**
   * Promotes a deployed or praised artifact to an exemplar.
   * DEFERRED — Exemplar promotion logic lands in Sprint 3 (Onboarding Intelligence).
   */
  async promoteExemplar(_input: ArtifactExemplarInput): Promise<ArtifactExemplar> {
    throw new PhaseNotImplementedError(
      'ArtifactIntelligenceDomain.promoteExemplar',
      'Sprint 3 (Onboarding Intelligence)',
    );
  }

  /**
   * Persists a blueprint for audit and feedback correlation.
   * Called by BlueprintBuilder (Sprint 1) after assembly.
   *
   * The blueprint id is caller-generated (crypto.randomUUID() in BlueprintBuilder)
   * so it is known before the DB round-trip and can be returned to BrandOS
   * for immediate use in feedback correlation.
   */
  async persistBlueprint(blueprint: ArtifactBlueprint): Promise<void> {
    // Epic 2 / E2-1-T1: blueprint.degraded, .confidenceScore, and
    // .buildDurationMs are intentionally not persisted below — there are no
    // columns for them yet in intelligence.artifact_blueprints (same
    // deferred treatment as quality_score). They are returned to the
    // caller (the part of the contract Epic 2 cares about) but not yet
    // written to the audit trail. Tracked as a documented gap, not an
    // oversight — see docs/IMPLEMENTATION_STATUS.md, "Known gaps."
    const { error } = await this.db
      .schema('intelligence')
      .from('artifact_blueprints')
      .insert({
        id:                          blueprint.id,
        user_id:                     blueprint.userId,
        artifact_type:               blueprint.artifactType,
        project_id:                  blueprint.projectId ?? null,
        relationship_id:             null, // Phase 2: named relationship calibration
        sections:                    blueprint.sections,
        narrative_frame:             blueprint.narrativeFrame,
        depth_spec:                  blueprint.depthSpec,
        voice_directives:            blueprint.voiceDirectives,
        vocabulary_directives:       blueprint.vocabularyDirectives,
        audience_calibration:        blueprint.audienceCalibration,
        compliance_requirements:     blueprint.complianceRequirements,
        conflicts_detected:          blueprint.conflictsDetected,
        conflicts_resolved:          blueprint.conflictsResolved,
        quality_score:               null, // Sprint 3+
        intelligence_profile_version: blueprint.intelligenceProfileVersion,
      });

    if (error) throw new DatabaseError('Failed to persist blueprint', error);
  }
}
