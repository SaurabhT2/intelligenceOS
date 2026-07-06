/**
 * ProfileBuilder.ts
 *
 * Stage 6 of the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec and Contracts B.2 Learning → Profile):
 *   • Assemble Intelligence Profile from all active Learnings
 *   • Version new profiles (increment version, mark previous non-current)
 *   • Compute composite confidence score (weighted by Taxonomy impact hierarchy)
 *   • Decide whether a rebuild is required
 *   • Emit intelligence.profile.updated event on rebuild
 *
 * Rebuild triggers (Contracts B.2 Learning → Intelligence Profile):
 *   • > 3 high-confidence Learnings added since last rebuild
 *   • Any permanent stability-class Learning changes
 *   • Profile not validated against new Learnings in > 60 days
 *
 * Domain access: reads Learnings via direct DB access (same pattern as
 * HypothesisEngine and LearningValidator — the domain write methods for
 * profiles are being un-stubbed in this sprint). The profile upsert
 * writes to intelligence.profiles directly, superseding the Sprint 0 stub.
 *
 * Source: BrandOS Logical Intelligence Schema D.1 Stage 6, B.2.
 * Source: BrandOS Intelligence Contracts B.2 (Learning → Intelligence Profile).
 * Source: BrandOS Learning Taxonomy Section G (Intelligence Value Hierarchy).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceProfile, Learning, TaxonomyCategory } from '../types/entities';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import { DatabaseError } from '../errors';

// ── Taxonomy impact weights (Section G — Intelligence Value Hierarchy) ─────────
// Categories rated ★★★★★ in artifact quality OR personalization get weight 1.0;
// ★★★★ → 0.8; ★★★ → 0.6; ★★ → 0.4; ★ → 0.2.
// Used for composite confidence scoring.

const TAXONOMY_WEIGHT: Partial<Record<TaxonomyCategory, number>> = {
  communication_style:            1.0,  // #1 — Critical impact across all dimensions
  writing_style:                  1.0,
  goals_and_objectives:           1.0,  // #2 — Highest strategic impact
  professional_identity:          0.8,  // #3
  expertise_domains:              0.8,  // #4
  knowledge_assets:               0.8,  // #5
  stakeholder_map:                0.8,  // #6
  strategic_thinking_patterns:    0.8,  // #7
  decision_making_style:          0.6,  // #8
  operating_principles:           0.6,  // #9
  audience_intelligence:          0.8,  // #10
  intellectual_frameworks:        0.6,  // #11
  success_metrics:                0.6,  // #12
  constraints_and_boundaries:     0.6,  // #13
  tool_and_technology_preferences:0.4,  // #14
  competitive_intelligence:       0.6,  // #15
  temporal_patterns:              0.4,  // #16
  cultural_and_linguistic_context:0.6,  // #17
  emotional_register:             0.4,  // #18
  learning_and_curiosity_patterns:0.4,  // #19
  collaboration_and_leadership_style:0.4, // #20
  model_preferences:              0.4,
  skills_inventory:               0.6,
  domain_specific_vocabulary:     0.6,
  personal_brand_signal:          0.6,
};

const DEFAULT_WEIGHT = 0.4;

// ── Rebuild threshold ─────────────────────────────────────────────────────────
// Contracts B.2: rebuild when > 3 high-confidence Learnings added.
const HIGH_CONFIDENCE_THRESHOLD = 0.65;
const NEW_LEARNINGS_REBUILD_THRESHOLD = 3;
// 60-day staleness threshold in milliseconds
const STALENESS_MS = 60 * 24 * 60 * 60 * 1000;

// ── DB row shapes ─────────────────────────────────────────────────────────────

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

function mapToLearning(row: LearningRow): Learning {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    domain: row.domain as Learning['domain'],
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

// ── RebuildDecision ───────────────────────────────────────────────────────────

export interface RebuildDecision {
  shouldRebuild: boolean;
  reason: string;
  newLearningsCount: number;
}

// ── ProfileBuilder ────────────────────────────────────────────────────────────

export class ProfileBuilder {
  constructor(
    private readonly db: SupabaseClient,
    private readonly bus: IntelligenceEventBus,
  ) {}

  /**
   * Evaluates whether a profile rebuild is needed for the given user,
   * considering the newly created Learning and the current profile state.
   *
   * Returns a RebuildDecision that FeedbackProcessor uses to decide whether
   * to call rebuild().
   */
  async shouldRebuild(userId: string, newLearning: Learning): Promise<RebuildDecision> {
    // Permanent-class change always triggers rebuild (Contracts B.2)
    if (newLearning.stabilityClass === 'permanent') {
      return {
        shouldRebuild: true,
        reason: 'Permanent stability-class learning created',
        newLearningsCount: 1,
      };
    }

    // Count high-confidence learnings created since last profile update
    const currentProfile = await this.getCurrentProfile(userId);

    if (!currentProfile) {
      // No profile yet — rebuild to create the first one
      return {
        shouldRebuild: true,
        reason: 'No profile exists — initial build required',
        newLearningsCount: 1,
      };
    }

    // Check staleness (> 60 days since last update)
    const ageMs = Date.now() - currentProfile.updatedAt.getTime();
    if (ageMs > STALENESS_MS) {
      return {
        shouldRebuild: true,
        reason: 'Profile staleness threshold exceeded (> 60 days)',
        newLearningsCount: 1,
      };
    }

    // Count new high-confidence learnings since last rebuild
    const newHighConfidenceLearnings = await this.countNewLearnings(
      userId,
      currentProfile.updatedAt,
    );

    if (newHighConfidenceLearnings > NEW_LEARNINGS_REBUILD_THRESHOLD) {
      return {
        shouldRebuild: true,
        reason: `${newHighConfidenceLearnings} new high-confidence learnings since last rebuild (threshold: ${NEW_LEARNINGS_REBUILD_THRESHOLD})`,
        newLearningsCount: newHighConfidenceLearnings,
      };
    }

    return {
      shouldRebuild: false,
      reason: `${newHighConfidenceLearnings}/${NEW_LEARNINGS_REBUILD_THRESHOLD} new high-confidence learnings — below threshold`,
      newLearningsCount: newHighConfidenceLearnings,
    };
  }

  /**
   * Builds a new version of the Intelligence Profile from all active Learnings.
   *
   * Steps:
   *   1. Load all active Learnings for the user
   *   2. Compute composite confidence score
   *   3. Build domain summaries
   *   4. Persist new profile version (is_current = true)
   *   5. Mark previous version non-current
   *   6. Emit intelligence.profile.updated event
   *
   * Returns the new profile. Caller (FeedbackProcessor) is responsible for
   * deciding when to call this.
   */
  async rebuild(userId: string, changedDomains: string[] = []): Promise<IntelligenceProfile> {
    const learnings = await this.loadActiveLearnings(userId);
    const currentProfile = await this.getCurrentProfile(userId);

    const nextVersion = (currentProfile?.version ?? 0) + 1;
    const compositeConfidence = computeCompositeConfidence(learnings);
    const summaries = buildDomainSummaries(learnings);

    // Persist new profile version
    const newProfile = await this.insertProfile(userId, nextVersion, compositeConfidence, summaries, currentProfile);

    // Mark previous version non-current
    if (currentProfile) {
      await this.markNonCurrent(userId, currentProfile.id);
    }

    // Emit profile.updated event
    await this.bus.emit('intelligence.profile.updated', {
      userId,
      profileId: newProfile.id,
      version: nextVersion,
      changedDomains,
      compositeConfidence,
      occurredAt: new Date().toISOString(),
    });

    return newProfile;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async getCurrentProfile(userId: string): Promise<IntelligenceProfile | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch current profile for ${userId}`, error);
    if (!data) return null;

    const row = data as ProfileRow;
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

  private async loadActiveLearnings(userId: string): Promise<Learning[]> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq('user_id', userId)
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (error) throw new DatabaseError(`Failed to load learnings for ${userId}`, error);
    return ((data as unknown[]) ?? []).map(r => mapToLearning(r as LearningRow));
  }

  private async countNewLearnings(userId: string, since: Date): Promise<number> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .select('id')
      .eq('user_id', userId)
      .gte('confidence', HIGH_CONFIDENCE_THRESHOLD)
      .gte('created_at', since.toISOString())
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (error) throw new DatabaseError(`Failed to count new learnings for ${userId}`, error);
    return ((data as unknown[]) ?? []).length;
  }

  private async insertProfile(
    userId: string,
    version: number,
    compositeConfidence: number,
    summaries: ReturnType<typeof buildDomainSummaries>,
    currentProfile: IntelligenceProfile | null,
  ): Promise<IntelligenceProfile> {
    const payload = {
      user_id:              userId,
      version,
      is_current:           true,
      composite_confidence: compositeConfidence,
      archetype_primary:    currentProfile?.archetypePrimary ?? null,
      archetype_confidence: currentProfile?.archetypeConfidence ?? null,
      voice_summary:        summaries.voice,
      goal_summary:         summaries.goals,
      constraint_summary:   summaries.constraints,
      preference_summary:   summaries.preferences,
      expertise_domains:    summaries.expertise,
      vocabulary_snapshot:  summaries.vocabulary,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new DatabaseError(`Failed to insert profile v${version} for ${userId}`, error);

    const row = data as ProfileRow;
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

  private async markNonCurrent(userId: string, excludeId: string): Promise<void> {
    const { error } = await this.db
      .schema('intelligence')
      .from('profiles')
      .update({ is_current: false })
      .eq('user_id', userId)
      .neq('id', excludeId)
      .eq('is_current', true);

    if (error) throw new DatabaseError(`Failed to mark previous profile non-current for ${userId}`, error);
  }
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Computes a weighted composite confidence from all active learnings.
 * Source: Contracts B.2 "weighted by Taxonomy impact hierarchy (Taxonomy Section G)".
 */
function computeCompositeConfidence(learnings: Learning[]): number {
  if (learnings.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const learning of learnings) {
    const weight = TAXONOMY_WEIGHT[learning.taxonomyCategory] ?? DEFAULT_WEIGHT;
    weightedSum += learning.confidence * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  // Round to 4 decimal places to avoid floating-point noise
  return Math.round((weightedSum / totalWeight) * 10000) / 10000;
}

/**
 * Groups Learnings into domain summary buckets for profile snapshot fields.
 * Each summary is a simple { [category]: content } map — a lightweight
 * snapshot that Blueprint Assembly can read without re-querying learnings.
 */
function buildDomainSummaries(learnings: Learning[]): {
  voice: Record<string, unknown> | null;
  goals: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  expertise: Record<string, unknown> | null;
  vocabulary: Record<string, unknown> | null;
} {
  const byCategory = new Map<string, Learning[]>();
  for (const l of learnings) {
    const existing = byCategory.get(l.taxonomyCategory) ?? [];
    existing.push(l);
    byCategory.set(l.taxonomyCategory, existing);
  }

  function summarise(categories: TaxonomyCategory[]): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};
    for (const cat of categories) {
      const ls = byCategory.get(cat);
      if (ls && ls.length > 0) {
        // Take the highest-confidence learning per category for the snapshot
        const best = ls.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
        result[cat] = { confidence: best.confidence, content: best.content };
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  return {
    voice: summarise(['communication_style', 'writing_style', 'emotional_register']),
    goals: summarise(['goals_and_objectives', 'success_metrics']),
    constraints: summarise(['constraints_and_boundaries', 'operating_principles']),
    preferences: summarise([
      'tool_and_technology_preferences', 'model_preferences',
      'temporal_patterns', 'collaboration_and_leadership_style',
    ]),
    expertise: summarise(['expertise_domains', 'skills_inventory', 'domain_specific_vocabulary']),
    vocabulary: summarise(['domain_specific_vocabulary', 'cultural_and_linguistic_context']),
  };
}
