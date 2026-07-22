/**
 * UserIntelligenceDomain.ts
 *
 * Owns: intelligence.profiles, intelligence.learnings, intelligence.archetypes,
 *       intelligence.hypotheses
 * No other domain may write to these tables.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 4.
 *
 * Completion Mission (post-Epic-2 session — see IMPLEMENTATION_STATUS.md):
 *   ✓ upsertProfile()          — real (implemented this session; Gap Analysis G-2)
 *   ✓ insertLearning()         — real (implemented this session; Gap Analysis G-2)
 *   ✓ confirmLearning() / getLatestValidatedLearning() — real, new (backs
 *     LearningValidator.maybeConfirm(), the explicit-correction fast path)
 *   ✓ Hypothesis CRUD (findOpenHypothesis / createHypothesis / updateHypothesis /
 *     markHypothesisPromoted / discardExpiredHypotheses) — real, new. Added here
 *     rather than as a seventh domain per Gap Analysis G-2's own open question:
 *     hypotheses are pipeline-internal, in-progress precursors to Learnings, the
 *     table this domain already owns — there is no independent product concept
 *     "hypothesis" outside the Learning Pipeline's own state machine, so a
 *     dedicated domain would only add a boundary with no distinct consumer on
 *     the other side of it. `HypothesisEngine`/`LearningValidator`/
 *     `ProfileBuilder` (pipeline/) call these methods instead of holding their
 *     own SupabaseClient — see those files' updated docblocks.
 *
 * Prior (Sprint 0) scope, unchanged:
 *   ✓ getCurrentProfile()      — real Supabase read
 *   ✓ getActiveLearnings()     — real Supabase read (single-domain filtered)
 *   ✓ getCurrentArchetype()    — real Supabase read
 *
 * ADR-003 (Subject-Centric Intelligence — see docs/adr/ADR-003-subject-centric-intelligence.md):
 *   Every method above that reads or writes a Subject-scoped row
 *   (`getCurrentProfile`, `getAllActiveLearnings`, `countLearningsSince`,
 *   `markPreviousProfilesNonCurrent`, `findOpenHypothesis`,
 *   `createHypothesis`, `discardExpiredHypotheses`) now has a
 *   `...ForSubject` counterpart accepting a `SubjectRef`
 *   (`types/subject.ts`) instead of assuming a User subject. The original
 *   names are retained, unchanged, as thin wrappers
 *   (`getCurrentProfile(userId)` == `getCurrentProfileForSubject(userSubject(userId))`)
 *   for backward compatibility with every existing User-subject call site.
 *   `insertLearning()` and `upsertProfile()` did not need new
 *   counterparts — `Learning`/`IntelligenceProfile` already carry
 *   `workspaceId`/`subjectType` fields, so the same method now writes
 *   either Subject type depending on what its input carries.
 *   `pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, and
 *   `pipeline/ProfileBuilder.ts` call the `...ForSubject` methods; nothing
 *   else in this codebase needed to change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceProfile, Learning, Archetype, Hypothesis } from '../types/entities';
import type { DomainType, TaxonomyCategory } from '../types';
import { DatabaseError, EntityNotFoundError, ProfileVersionConflictError, ValidationError } from '../errors';
import { userSubject, type SubjectRef, type SubjectType } from '../types/subject';

// ── Row shapes returned by Supabase (snake_case) ─────────────────────────────

interface ProfileRow {
  id: string;
  user_id: string | null;
  workspace_id?: string | null;
  subject_type?: 'user' | 'workspace';
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
  /** ADR-004 (Cognitive Consolidation) — see IntelligenceProfile's matching fields. */
  knowledge_summary: Record<string, unknown> | null;
  reasoning_summary: Record<string, unknown> | null;
  positioning_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface LearningRow {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  subject_type?: 'user' | 'workspace';
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

interface HypothesisRow {
  id: string;
  user_id: string | null;
  workspace_id?: string | null;
  subject_type?: 'user' | 'workspace';
  project_id: string | null;
  taxonomy_category: string;
  stability_class: string;
  state: string;
  confidence: number;
  required_corroborations: number;
  current_corroborations: number;
  high_quality_contradictions: number;
  proposition: Record<string, unknown>;
  context_scope: string;
  context_artifact_type: string | null;
  promoted_learning_id: string | null;
  expires_at: string | null;
  /** Evidence/Identity Bridge (ADR-005), migration 007. Absent on rows from before the migration ran — mapToHypothesis defaults to []. */
  evidence_trail?: unknown;
  created_at: string;
  updated_at: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/**
 * ADR-003 (Subject-Centric Intelligence): derives the `subjectType`
 * discriminator for a row that may predate migration 004 (no `subject_type`
 * column populated in a test mock, or a live row written before the
 * migration backfilled its default). Falls back to inferring from which id
 * is present, defaulting to 'user' — matches the migration's own DEFAULT
 * and CHECK constraints.
 */
function inferSubjectType(row: { subject_type?: SubjectType; user_id: string | null; workspace_id?: string | null }): SubjectType {
  if (row.subject_type) return row.subject_type;
  if (!row.user_id && row.workspace_id) return 'workspace';
  return 'user';
}

function mapToProfile(row: ProfileRow): IntelligenceProfile {
  const subjectType = inferSubjectType(row);
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id ?? null,
    subjectType,
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
    knowledgeSummary: row.knowledge_summary as IntelligenceProfile['knowledgeSummary'],
    reasoningSummary: row.reasoning_summary as IntelligenceProfile['reasoningSummary'],
    positioningSummary: row.positioning_summary as IntelligenceProfile['positioningSummary'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToLearning(row: LearningRow): Learning {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    subjectType: inferSubjectType(row),
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

function mapToHypothesis(row: HypothesisRow): Hypothesis {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id ?? null,
    subjectType: inferSubjectType(row),
    projectId: row.project_id,
    taxonomyCategory: row.taxonomy_category as TaxonomyCategory,
    stabilityClass: row.stability_class as Hypothesis['stabilityClass'],
    state: row.state as Hypothesis['state'],
    confidence: row.confidence,
    requiredCorroborations: row.required_corroborations,
    currentCorroborations: row.current_corroborations,
    highQualityContradictions: row.high_quality_contradictions,
    proposition: row.proposition,
    contextScope: row.context_scope as Hypothesis['contextScope'],
    contextArtifactType: row.context_artifact_type,
    promotedLearningId: row.promoted_learning_id,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    evidenceTrail: Array.isArray(row.evidence_trail) ? (row.evidence_trail as Hypothesis['evidenceTrail']) : [],
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
   * Source: Architecture Section 4 (verbatim method signature). Retained
   * under this name/signature for backward compatibility; delegates to
   * `getCurrentProfileForSubject` (ADR-003).
   */
  async getCurrentProfile(userId: string): Promise<IntelligenceProfile | null> {
    return this.getCurrentProfileForSubject(userSubject(userId));
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — returns the current
   * (is_current = true) intelligence profile for any Subject (User or
   * Workspace), or null if none has been built yet.
   */
  async getCurrentProfileForSubject(subject: SubjectRef): Promise<IntelligenceProfile | null> {
    const column = subject.subjectType === 'user' ? 'user_id' : 'workspace_id';
    const { data, error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .select('*')
      .eq(column, subject.subjectId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch profile for ${subject.subjectType} ${subject.subjectId}`, error);
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
   * Persists a profile version verbatim (upsert by id) — the caller (Profile
   * Builder) is responsible for computing the next version number, the
   * composite confidence, and the domain summaries, and for generating the
   * row's id; this method's only job is the write. Does NOT by itself mark
   * any other row non-current — call `markPreviousProfilesNonCurrent()`
   * separately once the new row is durably persisted, mirroring the
   * two-step pattern (`ProfileBuilder.rebuild()`'s `insertProfile()` then
   * `markNonCurrent()`) this method replaces.
   *
   * Real implementation — completed this session. Un-stubbed per Gap
   * Analysis G-2: this was previously a documented-but-unused stub while
   * `pipeline/ProfileBuilder.ts` held its own `SupabaseClient` and wrote to
   * `intelligence.profiles` directly. `ProfileBuilder` now calls this
   * method instead.
   */
  async upsertProfile(profile: IntelligenceProfile): Promise<void> {
    const payload = {
      id:                   profile.id,
      user_id:              profile.userId,
      workspace_id:         profile.workspaceId,
      subject_type:         profile.subjectType,
      version:              profile.version,
      is_current:           profile.isCurrent,
      composite_confidence: profile.compositeConfidence,
      archetype_primary:    profile.archetypePrimary,
      archetype_confidence: profile.archetypeConfidence,
      voice_summary:        profile.voiceSummary,
      goal_summary:         profile.goalSummary,
      constraint_summary:   profile.constraintSummary,
      preference_summary:   profile.preferenceSummary,
      expertise_domains:    profile.expertiseDomains,
      vocabulary_snapshot:  profile.vocabularySnapshot,
      knowledge_summary:    profile.knowledgeSummary,
      reasoning_summary:    profile.reasoningSummary,
      positioning_summary:  profile.positioningSummary,
    };

    const { error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      // A concurrent rebuild for this same Subject already committed its
      // "current" row first — expected under concurrent triggers (e.g.
      // several knowledge assets finishing extraction around the same
      // time), not a real failure. Let the caller (ProfileBuilder.
      // rebuildForSubject()) retry against the winner's committed state
      // instead of surfacing this as an opaque DatabaseError.
      const isCurrentProfileRace =
        (error as { code?: string }).code === '23505' &&
        /intelligence_profiles_(user|workspace)_current/.test(error.message ?? '');
      if (isCurrentProfileRace) {
        throw new ProfileVersionConflictError(error);
      }
      const subjectLabel = profile.subjectType === 'workspace' ? `workspace ${profile.workspaceId}` : `user ${profile.userId}`;
      throw new DatabaseError(`Failed to upsert profile ${profile.id} for ${subjectLabel}`, error);
    }
  }

  /**
   * Marks every other current profile row for a user as non-current,
   * except the one just inserted via `upsertProfile()`. Second half of the
   * versioning two-step — see `upsertProfile()`'s docblock.
   *
   * Retained under this name/signature for backward compatibility;
   * delegates to `markPreviousProfilesNonCurrentForSubject` (ADR-003).
   */
  async markPreviousProfilesNonCurrent(userId: string, excludeId: string): Promise<void> {
    return this.markPreviousProfilesNonCurrentForSubject(userSubject(userId), excludeId);
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — marks every other current
   * profile row for any Subject (User or Workspace) as non-current, except
   * the one just inserted via `upsertProfile()`.
   */
  async markPreviousProfilesNonCurrentForSubject(subject: SubjectRef, excludeId: string): Promise<void> {
    const column = subject.subjectType === 'user' ? 'user_id' : 'workspace_id';
    const { error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .update({ is_current: false })
      .eq(column, subject.subjectId)
      .neq('id', excludeId)
      .eq('is_current', true);

    if (error) throw new DatabaseError(`Failed to mark previous profile non-current for ${subject.subjectType} ${subject.subjectId}`, error);
  }

  /**
   * Returns every active-state Learning for a user across ALL domains
   * (unlike `getActiveLearnings()`, which requires a single `DomainType`
   * filter). Added this session for `ProfileBuilder.rebuild()`, which
   * assembles a profile from the user's complete active-learning set, not
   * one domain's slice of it.
   */
  /**
   * Returns every active-state Learning for a user across ALL domains
   * (unlike `getActiveLearnings()`, which requires a single `DomainType`
   * filter). Added this session for `ProfileBuilder.rebuild()`, which
   * assembles a profile from the user's complete active-learning set, not
   * one domain's slice of it.
   *
   * Retained under this name/signature for backward compatibility;
   * delegates to `getAllActiveLearningsForSubject` (ADR-003).
   */
  async getAllActiveLearnings(userId: string): Promise<Learning[]> {
    return this.getAllActiveLearningsForSubject(userSubject(userId));
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — returns every active-state
   * Learning for any Subject (User or Workspace) across all domains.
   */
  async getAllActiveLearningsForSubject(subject: SubjectRef): Promise<Learning[]> {
    const column = subject.subjectType === 'user' ? 'user_id' : 'workspace_id';
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq(column, subject.subjectId)
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (error) throw new DatabaseError(`Failed to load learnings for ${subject.subjectType} ${subject.subjectId}`, error);
    return ((data ?? []) as LearningRow[]).map(mapToLearning);
  }

  /**
   * Counts active-state Learnings at or above a confidence floor, created
   * since a given timestamp — the exact query `ProfileBuilder.shouldRebuild()`
   * needs to evaluate the "> 3 high-confidence Learnings since last rebuild"
   * trigger (Contracts B.2).
   *
   * Retained under this name/signature for backward compatibility;
   * delegates to `countLearningsSinceForSubject` (ADR-003).
   */
  async countLearningsSince(userId: string, since: Date, minConfidence: number): Promise<number> {
    return this.countLearningsSinceForSubject(userSubject(userId), since, minConfidence);
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — counts active-state Learnings
   * for any Subject (User or Workspace) at or above a confidence floor,
   * created since a given timestamp.
   */
  async countLearningsSinceForSubject(subject: SubjectRef, since: Date, minConfidence: number): Promise<number> {
    const column = subject.subjectType === 'user' ? 'user_id' : 'workspace_id';
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('id')
      .eq(column, subject.subjectId)
      .gte('confidence', minConfidence)
      .gte('created_at', since.toISOString())
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (error) throw new DatabaseError(`Failed to count new learnings for ${subject.subjectType} ${subject.subjectId}`, error);
    return ((data as unknown[]) ?? []).length;
  }

  /**
   * Inserts a new validated learning.
   *
   * Real implementation — completed this session. Un-stubbed per Gap
   * Analysis G-2: this was previously a documented-but-unused stub while
   * `pipeline/LearningValidator.ts` held its own `SupabaseClient` and wrote
   * to `intelligence.learnings` directly. `LearningValidator.createLearning()`
   * now calls this method instead.
   */
  async insertLearning(learning: Omit<Learning, 'id' | 'createdAt' | 'updatedAt'>): Promise<Learning> {
    const payload = {
      user_id:               learning.userId,
      workspace_id:          learning.workspaceId,
      subject_type:          learning.subjectType,
      project_id:            learning.projectId,
      domain:                learning.domain,
      taxonomy_category:     learning.taxonomyCategory,
      stability_class:       learning.stabilityClass,
      state:                 learning.state,
      confidence:            learning.confidence,
      context_scope:         learning.contextScope,
      context_artifact_type: learning.contextArtifactType,
      context_project_id:    learning.contextProjectId,
      context_audience_type: learning.contextAudienceType,
      content:               learning.content,
      source_summary:        learning.sourceSummary,
      decay_rate:            learning.decayRate,
      last_confirmed_at:     learning.lastConfirmedAt ? learning.lastConfirmedAt.toISOString() : null,
      decay_started_at:      learning.decayStartedAt ? learning.decayStartedAt.toISOString() : null,
      archived_at:           learning.archivedAt ? learning.archivedAt.toISOString() : null,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      const subjectLabel = learning.subjectType === 'workspace' ? `workspace ${learning.workspaceId}` : `user ${learning.userId}`;
      throw new DatabaseError(`Failed to create learning for ${subjectLabel}`, error);
    }
    return mapToLearning(data as LearningRow);
  }

  /**
   * Returns the most recent VALIDATED Learning for a user + taxonomy
   * category, or null if none exists. Backs `LearningValidator.maybeConfirm()`
   * — the explicit-correction fast path (Contracts B.2: corrections bypass
   * quarantine and apply immediately).
   */
  async getLatestValidatedLearning(userId: string, taxonomyCategory: TaxonomyCategory): Promise<Learning | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq('user_id', userId)
      .eq('taxonomy_category', taxonomyCategory)
      .eq('state', 'VALIDATED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new DatabaseError('Failed to query learnings for confirmation', error);
    return data ? mapToLearning(data as LearningRow) : null;
  }

  /**
   * Upgrades a VALIDATED learning to CONFIRMED with a boosted confidence.
   * Second half of `LearningValidator.maybeConfirm()` — see
   * `getLatestValidatedLearning()` above for the matching read.
   */
  async confirmLearning(learningId: string, confidence: number): Promise<void> {
    const { error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .update({
        state:              'CONFIRMED',
        confidence,
        last_confirmed_at:  new Date().toISOString(),
      })
      .eq('id', learningId);

    if (error) throw new DatabaseError(`Failed to confirm learning ${learningId}`, error);
  }

  // ── Hypothesis CRUD (Learning Pipeline Stage 3 persistence) ────────────────
  //
  // Added this session (Gap Analysis G-2). `intelligence.hypotheses` holds
  // in-progress precursors to Learnings — this domain's table — so these
  // methods live here rather than behind a seventh, hypothesis-only domain.
  // `pipeline/HypothesisEngine.ts` calls these instead of holding its own
  // SupabaseClient; all state-transition logic (corroboration/contradiction
  // math) stays in HypothesisEngine, which is business logic, not persistence.

  /**
   * Finds the most recent open (PROVISIONAL/ACCUMULATING/CHALLENGED)
   * Hypothesis for a user + taxonomy category + context scope, or null.
   *
   * Retained under this name/signature for backward compatibility;
   * delegates to `findOpenHypothesisForSubject` (ADR-003).
   */
  async findOpenHypothesis(
    userId: string,
    taxonomyCategory: TaxonomyCategory,
    contextScope: string,
  ): Promise<Hypothesis | null> {
    return this.findOpenHypothesisForSubject(userSubject(userId), taxonomyCategory, contextScope);
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — finds the most recent open
   * Hypothesis for any Subject (User or Workspace) + taxonomy category +
   * context scope, or null.
   */
  async findOpenHypothesisForSubject(
    subject: SubjectRef,
    taxonomyCategory: TaxonomyCategory,
    contextScope: string,
  ): Promise<Hypothesis | null> {
    const column = subject.subjectType === 'user' ? 'user_id' : 'workspace_id';
    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .select('*')
      .eq(column, subject.subjectId)
      .eq('taxonomy_category', taxonomyCategory)
      .eq('context_scope', contextScope)
      .in('state', ['PROVISIONAL', 'ACCUMULATING', 'CHALLENGED'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(
        `Failed to query hypotheses for ${subject.subjectType} ${subject.subjectId} / ${taxonomyCategory}`,
        error,
      );
    }

    return data ? mapToHypothesis(data as HypothesisRow) : null;
  }

  /**
   * Creates a new Hypothesis row from a fully-formed insert payload
   * (already snake_case — `HypothesisEngine` builds this from its own pure
   * `PROVISIONAL`-initialization logic, which is business logic this domain
   * does not duplicate).
   *
   * Retained under this name/signature for backward compatibility — the
   * payload's `user_id` key still works unchanged. `HypothesisEngine`
   * itself now calls `createHypothesisForSubject` (ADR-003), which is
   * identical apart from accepting a payload shaped by
   * `types/subject.ts`'s `subjectColumns()` (`{ subject_type, user_id,
   * workspace_id, ... }`) instead of a bare `user_id`.
   */
  async createHypothesis(payload: Record<string, unknown>): Promise<Hypothesis> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new DatabaseError('Failed to create hypothesis', error);
    return mapToHypothesis(data as HypothesisRow);
  }

  /** ADR-003 (Subject-Centric Intelligence) — see `createHypothesis()`'s docblock. */
  async createHypothesisForSubject(payload: Record<string, unknown>): Promise<Hypothesis> {
    return this.createHypothesis(payload);
  }

  /**
   * Applies a partial update (already snake_case — computed by
   * `HypothesisEngine`'s pure corroboration/contradiction logic) to an
   * existing Hypothesis and returns the updated row.
   */
  async updateHypothesis(hypothesisId: string, updates: Record<string, unknown>): Promise<Hypothesis> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .update(updates)
      .eq('id', hypothesisId)
      .select('*')
      .single();

    if (error) throw new DatabaseError(`Failed to update hypothesis ${hypothesisId}`, error);
    return mapToHypothesis(data as HypothesisRow);
  }

  /**
   * Marks a Hypothesis as promoted to a Learning. Called by
   * `LearningValidator` after a successful promotion.
   */
  async markHypothesisPromoted(hypothesisId: string, learningId: string): Promise<void> {
    const { error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .update({ state: 'VALIDATED', promoted_learning_id: learningId })
      .eq('id', hypothesisId);

    if (error) throw new DatabaseError(`Failed to mark hypothesis ${hypothesisId} as promoted`, error);
  }

  /**
   * Discards expired, non-permanent PROVISIONAL/ACCUMULATING hypotheses for
   * a user (timeout > 30 days — Schema D.1 Stage 4). Called opportunistically
   * by `FeedbackProcessor` after each run.
   */
  /**
   * Discards expired, non-permanent PROVISIONAL/ACCUMULATING hypotheses for
   * a user (timeout > 30 days — Schema D.1 Stage 4). Called opportunistically
   * by `FeedbackProcessor` after each run.
   *
   * Retained under this name/signature for backward compatibility;
   * delegates to `discardExpiredHypothesesForSubject` (ADR-003).
   */
  async discardExpiredHypotheses(userId: string): Promise<number> {
    return this.discardExpiredHypothesesForSubject(userSubject(userId));
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) — discards expired, non-permanent
   * PROVISIONAL/ACCUMULATING hypotheses for any Subject (User or Workspace).
   */
  async discardExpiredHypothesesForSubject(subject: SubjectRef): Promise<number> {
    const column = subject.subjectType === 'user' ? 'user_id' : 'workspace_id';
    const now = new Date().toISOString();

    const { data, error } = await this.db
      .schema('intelligence')
      .from('hypotheses')
      .update({ state: 'DISCARDED' })
      .eq(column, subject.subjectId)
      .in('state', ['PROVISIONAL', 'ACCUMULATING'])
      .neq('stability_class', 'permanent')
      .lt('expires_at', now)
      .select('id');

    if (error) throw new DatabaseError(`Failed to discard expired hypotheses for ${subject.subjectType} ${subject.subjectId}`, error);
    return (data as unknown[]).length;
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
