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
 *   ✗ updatePatternFromExemplar() — stub (Sprint 3 — user-calibrated pattern upgrade)
 *
 * Sprint 1 scope:
 *   ✓ persistBlueprint()     — real Supabase write; called by BlueprintBuilder
 *     after assembly. As of this session (Completion Mission), also persists
 *     `degraded` and `confidence_score` (Epic 2 / E2-1-T1 fields) —
 *     previously returned to the caller only; see the method's own docblock
 *     and IMPLEMENTATION_STATUS.md, migration #4, for the column addition
 *     and the rationale for leaving `buildDurationMs` unpersisted.
 *     (Note: this class's Sprint 0 docblock previously, incorrectly, listed
 *     this method as a stub — corrected this session; it was never actually
 *     unimplemented, only mis-described here.)
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
   * Marks the most recent unprocessed feedback_events row for an artifact
   * as signals_extracted = true. Called by the Learning Pipeline's
   * `FeedbackProcessor` once it has finished running Signal → Profile for
   * a given feedback event.
   *
   * Completion Mission note: added this session alongside the Gap Analysis
   * G-2 fix. `FeedbackProcessor` previously did this update itself via a
   * private `SupabaseClient`, bypassing this domain even though it's the
   * documented sole owner of `intelligence.feedback_events` — the exact
   * same anti-pattern G-2 flagged for `intelligence.hypotheses` /
   * `intelligence.learnings` / `intelligence.profiles`, just not caught by
   * the original audit because it wasn't a *raw* Supabase write inside a
   * pipeline *stage* class — it was one line inside the orchestrator.
   */
  async markSignalsExtracted(artifactId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .schema('intelligence')
      .from('feedback_events')
      .update({ signals_extracted: true })
      .eq('artifact_id', artifactId)
      .eq('user_id', userId)
      .eq('signals_extracted', false);

    if (error) {
      throw new DatabaseError(
        `Failed to mark signals_extracted for artifact ${artifactId}`,
        error,
      );
    }
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
    // Epic 2 / E2-1-T1: `degraded` and `confidenceScore` are persisted as of
    // this session (Completion Mission — see IMPLEMENTATION_STATUS.md,
    // migration #4). `buildDurationMs` remains deliberately unpersisted: it
    // is a performance metric, not blueprint state, and is a better fit for
    // an observability pipeline than a row-level audit column — it is still
    // returned to the caller only.
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
        degraded:                    blueprint.degraded,
        confidence_score:            blueprint.confidenceScore,
      });

    if (error) throw new DatabaseError('Failed to persist blueprint', error);
  }
}
