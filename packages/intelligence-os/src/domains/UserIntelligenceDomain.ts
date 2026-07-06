/**
 * UserIntelligenceDomain.ts
 *
 * Owns: intelligence.profiles, intelligence.learnings, intelligence.archetypes
 * No other domain may write to these tables.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 4.
 *
 * Sprint 0 scope:
 *   ✓ getCurrentProfile()      — real Supabase read
 *   ✓ getActiveLearnings()     — real Supabase read
 *   ✓ getCurrentArchetype()    — real Supabase read (new table, approved Sprint 0)
 *   ✗ upsertProfile()          — stub (Profile Builder, Sprint 2+)
 *   ✗ insertLearning()         — stub (Learning Validator, Sprint 2+)
 *   ✗ transitionLearningState()— stub (Learning Validator, Sprint 2+)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceProfile, Learning, Archetype } from '../types/entities';
import type { DomainType, TaxonomyCategory } from '../types';
import { DatabaseError, PhaseNotImplementedError, EntityNotFoundError, ValidationError } from '../errors';

// ── Row shapes returned by Supabase (snake_case) ─────────────────────────────

interface ProfileRow {
  id: string;
  user_id: string;
  version: number;
  is_current: boolean;
  composite_confidence: number;
  archetype_primary: string | null;
  archetype_confidence: number | null;
  voice_summary: Record<string, unknown> | null;
  goal_summary: Record<string, unknown> | null;
  constraint_summary: Record<string, unknown> | null;
  preference_summary: Record<string, unknown> | null;
  expertise_domains: Record<string, unknown> | null;
  vocabulary_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface LearningRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  project_id: string | null;
  domain: string;
  taxonomy_category: string;
  stability_class: string;
  state: string;
  confidence: number;
  context_scope: string;
  context_artifact_type: string | null;
  context_project_id: string | null;
  context_audience_type: string | null;
  content: Record<string, unknown>;
  source_summary: Record<string, unknown>;
  decay_rate: string | null;
  last_confirmed_at: string | null;
  decay_started_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ArchetypeRow {
  id: string;
  user_id: string;
  archetype_type: string;
  confidence: number;
  is_primary: boolean;
  evidence_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapToProfile(row: ProfileRow): IntelligenceProfile {
  return {
    id: row.id,
    userId: row.user_id,
    version: row.version,
    isCurrent: row.is_current,
    compositeConfidence: row.composite_confidence,
    archetypePrimary: row.archetype_primary as IntelligenceProfile['archetypePrimary'],
    archetypeConfidence: row.archetype_confidence,
    voiceSummary: row.voice_summary,
    goalSummary: row.goal_summary,
    constraintSummary: row.constraint_summary,
    preferenceSummary: row.preference_summary,
    expertiseDomains: row.expertise_domains,
    vocabularySnapshot: row.vocabulary_snapshot,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToLearning(row: LearningRow): Learning {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    domain: row.domain as DomainType,
    taxonomyCategory: row.taxonomy_category as TaxonomyCategory,
    stabilityClass: row.stability_class as Learning['stabilityClass'],
    state: row.state as Learning['state'],
    confidence: row.confidence,
    contextScope: row.context_scope as Learning['contextScope'],
    contextArtifactType: row.context_artifact_type,
    contextProjectId: row.context_project_id,
    contextAudienceType: row.context_audience_type,
    content: row.content,
    sourceSummary: row.source_summary,
    decayRate: row.decay_rate as Learning['decayRate'],
    lastConfirmedAt: row.last_confirmed_at ? new Date(row.last_confirmed_at) : null,
    decayStartedAt: row.decay_started_at ? new Date(row.decay_started_at) : null,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToArchetype(row: ArchetypeRow): Archetype {
  return {
    id: row.id,
    userId: row.user_id,
    archetypeType: row.archetype_type,
    confidence: row.confidence,
    isPrimary: row.is_primary,
    evidenceSummary: row.evidence_summary,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Domain class ──────────────────────────────────────────────────────────────

export class UserIntelligenceDomain {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Returns the current (is_current = true) intelligence profile for a user,
   * or null if no profile has been built yet (new user, pre-onboarding).
   *
   * Source: Architecture Section 4 (verbatim method signature).
   */
  async getCurrentProfile(userId: string): Promise<IntelligenceProfile | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch profile for user ${userId}`, error);
    return data ? mapToProfile(data as ProfileRow) : null;
  }

  /**
   * Returns active learnings for a user in a given domain, optionally
   * filtered by taxonomy category. "Active" means state is one of
   * VALIDATED, CONFIRMED, or ACTIVE (not DECAYING, FLAGGED, ARCHIVED, RETIRED).
   *
   * Source: Architecture Section 4 (verbatim method signature).
   */
  async getActiveLearnings(
    userId: string,
    domain: DomainType,
    categories?: TaxonomyCategory[],
  ): Promise<Learning[]> {
    let query = this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (categories && categories.length > 0) {
      query = query.in('taxonomy_category', categories);
    }

    const { data, error } = await query;
    if (error) throw new DatabaseError(`Failed to fetch learnings for user ${userId}`, error);
    return (data ?? []).map((row: LearningRow) => mapToLearning(row));
  }

  /**
   * Returns the primary archetype for a user, or null if none has been
   * assigned yet. The archetype table is the system of record; profiles
   * caches archetypePrimary/archetypeConfidence for fast reads.
   *
   * New table added Sprint 0 per Logical Schema K.2 (Phase-1-mandatory).
   */
  async getCurrentArchetype(userId: string): Promise<Archetype | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('archetypes')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch archetype for user ${userId}`, error);
    return data ? mapToArchetype(data as ArchetypeRow) : null;
  }

  /**
   * Returns the generic audience profile for a given audience type.
   *
   * This is the Phase 1 path for AudienceCalibration (Contracts J.2):
   * named Relationship calibration is Phase 2; for Phase 1, the
   * AudienceCalibrator reads generic profiles keyed on audience_type.
   *
   * Called by AudienceCalibrator (Sprint 1). Returns null when no profile
   * exists for this user + audience type combination — the caller falls back
   * to system defaults in that case.
   */
  async getGenericAudienceProfile(
    userId: string,
    audienceType: string,
  ): Promise<import('../types/entities').AudienceProfile | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('audience_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('owner_type', 'generic')
      .eq('audience_type', audienceType)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(
        `Failed to fetch generic audience profile for user ${userId}, type ${audienceType}`,
        error,
      );
    }
    if (!data) return null;

    const row = data as {
      id: string; user_id: string; owner_type: string; relationship_id: string | null;
      audience_type: string | null; expertise_level: string; communication_norms: Record<string, unknown>;
      known_sensitivities: Record<string, unknown>; confidence: number; is_active: boolean;
      created_at: string; updated_at: string;
    };

    return {
      id: row.id,
      userId: row.user_id,
      ownerType: row.owner_type as import('../types/entities').AudienceProfileOwnerType,
      relationshipId: row.relationship_id,
      audienceType: row.audience_type as import('../types/entities').AudienceType | null,
      expertiseLevel: row.expertise_level as import('../types/entities').ExpertiseLevel,
      communicationNorms: row.communication_norms,
      knownSensitivities: row.known_sensitivities,
      confidence: row.confidence,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Persists a new profile version and marks the previous current row as
   * non-current. The two-step pattern preserves full version history.
   *
   * DEFERRED — implemented by Profile Builder (Sprint 2+).
   * The method signature is here so Sprint 1 callers can type-check against it.
   */
  async upsertProfile(_profile: IntelligenceProfile): Promise<void> {
    throw new PhaseNotImplementedError('UserIntelligenceDomain.upsertProfile', 'Sprint 2 (Learning Pipeline — Profile Builder)');
  }

  /**
   * Inserts a new validated learning.
   * DEFERRED — implemented by Learning Validator (Sprint 2+).
   */
  async insertLearning(_learning: Omit<Learning, 'id' | 'createdAt' | 'updatedAt'>): Promise<Learning> {
    throw new PhaseNotImplementedError('UserIntelligenceDomain.insertLearning', 'Sprint 2 (Learning Pipeline — Learning Validator)');
  }

  // ── E1-1: Human Learning Review API ────────────────────────────────────────

  /**
   * Transitions a FLAGGED learning to ACTIVE (approved=true) or
   * ARCHIVED (approved=false). Represents supervisory review of a
   * machine-proposed signal.
   *
   * State machine: FLAGGED → ACTIVE | FLAGGED → ARCHIVED
   *
   * Error conditions:
   *   - `EntityNotFoundError` when `learningId` does not exist in
   *     `intelligence.learnings`.
   *   - `ValidationError` when the learning exists but belongs to a
   *     different userId (ownership mismatch).
   *
   * Source: Engineering Roadmap E1-1.
   */
  async reviewLearning(
    userId: string,
    learningId: string,
    approved: boolean,
    reviewedBy: string,
  ): Promise<{ newState: 'ACTIVE' | 'ARCHIVED'; previousState: string }> {
    const row = await this.fetchLearningForReview(learningId);

    if (row.user_id !== userId) {
      throw new ValidationError(
        `Learning ${learningId} belongs to a different user`,
        'userId',
      );
    }

    return this.transitionLearningState(row, approved, reviewedBy);
  }

  // ── Milestone 2: CognitionProvider.review() integration ─────────────────
  //
  // CognitionReviewDecision (`@platform/cognition-contract`) carries only
  // `{ workspaceId, entryId, approved, reviewedBy }` — no userId. The
  // contract is not being modified to add one (Milestone 2 direction), so
  // this method reuses the exact same fetch-then-transition logic as
  // `reviewLearning` above, gated on `workspace_id` instead of `user_id`.
  // No new state-machine or persistence logic — see transitionLearningState().

  /**
   * Workspace-scoped variant of `reviewLearning`, for CognitionProvider's
   * `review()` operation, which has no userId to check ownership against.
   *
   * Error conditions mirror `reviewLearning`:
   *   - `EntityNotFoundError` when `entryId` does not exist.
   *   - `ValidationError` when the learning exists but its `workspace_id`
   *     does not match — including when the learning has no workspace_id
   *     at all (a purely user-scoped learning was never surfaced through a
   *     workspace-scoped review flow, so treat that as a mismatch too).
   *
   * Source: Milestone 2 (CognitionProvider integration layer).
   */
  async reviewLearningForWorkspace(
    workspaceId: string,
    entryId: string,
    approved: boolean,
    reviewedBy: string,
  ): Promise<{ newState: 'ACTIVE' | 'ARCHIVED'; previousState: string }> {
    const row = await this.fetchLearningForReview(entryId);

    if (row.workspace_id !== workspaceId) {
      throw new ValidationError(
        `Learning ${entryId} belongs to a different workspace`,
        'workspaceId',
      );
    }

    return this.transitionLearningState(row, approved, reviewedBy);
  }

  /**
   * Shared fetch step for both review paths — fetches by id only (no
   * ownership filter), so the caller can distinguish not-found from
   * wrong-owner and choose the appropriate error.
   */
  private async fetchLearningForReview(
    learningId: string,
  ): Promise<{ id: string; user_id: string; workspace_id: string | null; state: string }> {
    const { data: rawData, error: fetchError } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('id, user_id, workspace_id, state')
      .eq('id', learningId)
      .maybeSingle();

    if (fetchError) {
      throw new DatabaseError(`Failed to fetch learning ${learningId}`, fetchError);
    }

    if (!rawData) {
      throw new EntityNotFoundError('Learning', learningId);
    }

    return rawData as { id: string; user_id: string; workspace_id: string | null; state: string };
  }

  /**
   * Shared state-transition step for both review paths. Identical to the
   * pre-Milestone-2 `reviewLearning` update logic — extracted, not
   * rewritten, so both entry points apply exactly the same state machine
   * (FLAGGED → ACTIVE | FLAGGED → ARCHIVED) and timestamp bookkeeping.
   */
  private async transitionLearningState(
    row: { id: string; state: string },
    approved: boolean,
    _reviewedBy: string,
  ): Promise<{ newState: 'ACTIVE' | 'ARCHIVED'; previousState: string }> {
    const newState: 'ACTIVE' | 'ARCHIVED' = approved ? 'ACTIVE' : 'ARCHIVED';
    const now = new Date().toISOString();

    const updateFields: Record<string, unknown> = {
      state:      newState,
      updated_at: now,
    };

    // Archived learnings get an archived_at timestamp; active learnings get
    // last_confirmed_at to restart their confidence clock.
    if (newState === 'ARCHIVED') {
      updateFields['archived_at'] = now;
    } else {
      updateFields['last_confirmed_at'] = now;
    }

    const { error: updateError } = await this.db
      .schema('intelligence')
      .from('learnings')
      .update(updateFields)
      .eq('id', row.id);

    if (updateError) {
      throw new DatabaseError(`Failed to update learning ${row.id}`, updateError);
    }

    return { newState, previousState: row.state };
  }

  // ── E1-3: countActiveLearnings / getTopTaxonomyCategories ──────────────────

  /**
   * Counts learnings in active states (ACTIVE, CONFIRMED, VALIDATED) for a
   * user, optionally scoped to a workspace.
   *
   * Source: Engineering Roadmap E1-3.
   */
  async countActiveLearnings(userId: string, workspaceId?: string): Promise<number> {
    let query = this.db
      .schema('intelligence')
      .from('learnings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('state', ['ACTIVE', 'CONFIRMED', 'VALIDATED']);

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { count, error } = await query;
    if (error) throw new DatabaseError(`Failed to count learnings for user ${userId}`, error);
    return count ?? 0;
  }

  /**
   * Returns the top N taxonomy categories by learning count for a user.
   * Only counts learnings in active states (ACTIVE, CONFIRMED, VALIDATED).
   *
   * Source: Engineering Roadmap E1-3.
   */
  async getTopTaxonomyCategories(userId: string, limit = 3): Promise<string[]> {
    // Fetch all active learnings and aggregate in-process (avoids raw SQL GROUP BY
    // while staying within the Supabase client API surface this package already uses).
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('taxonomy_category')
      .eq('user_id', userId)
      .in('state', ['ACTIVE', 'CONFIRMED', 'VALIDATED']);

    if (error) throw new DatabaseError(`Failed to fetch taxonomy categories for user ${userId}`, error);

    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { taxonomy_category: string }[]) {
      counts[row.taxonomy_category] = (counts[row.taxonomy_category] ?? 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([category]) => category);
  }

}
