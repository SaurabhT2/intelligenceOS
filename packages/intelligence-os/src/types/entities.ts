/**
 * entities.ts
 *
 * TypeScript shapes for the entities Intelligence OS persists or operates on.
 *
 * Provenance: Architecture Section 3 (schema.sql) is authoritative for field
 * presence and naming; Logical Intelligence Schema A.2/B is authoritative
 * for which of the 24 logical entities exist.
 *
 * Of the 24 entities in Logical Schema A.2, this file covers 16. The other
 * 8 are deliberately not here:
 *  - User, Artifact: owned externally (auth.users / BrandOS), referenced by
 *    id only — see UserId / ArtifactId below.
 *  - ArtifactBlueprint, FeedbackEvent (the public input shape): live in
 *    @intelligence-os/shared-types, not here.
 *  - Goal, Constraint, Preference, Framework, Operating Principle,
 *    Vocabulary Model: embedded JSONB sub-structures on Profile/Project
 *    (see IntelligenceProfile.goalSummary etc.), not standalone shapes —
 *    their precise internal structure is owned by Profile Builder
 *    (Sprint 2+), which is out of scope here.
 *  - Observation: pipeline-internal/transient (Learning Pipeline, Sprint 2+).
 *    Nothing in Sprint 0 constructs or consumes one, so it's intentionally
 *    omitted rather than guessed at.
 *  - Conflict: ephemeral per Contracts J.2 in Phase 1 — modeled only as
 *    DetectedConflict / ConflictResolution inside ArtifactBlueprint
 *    (shared-intelligence-types), not as its own table or entity here.
 */

import type { DomainType } from './domains';
import type { SubjectType } from './subject';

export type UserId = string;
export type ArtifactId = string;

export type { SubjectType, SubjectRef } from './subject';

// ---- Taxonomy ---------------------------------------------------------------

/**
 * All 25 categories, source: BrandOS_Intelligence_Framework_learning_taxonomy.md,
 * Section A (Complete Learning Taxonomy).
 */
export type TaxonomyCategory =
  | 'professional_identity'
  | 'expertise_domains'
  | 'skills_inventory'
  | 'communication_style'
  | 'writing_style'
  | 'strategic_thinking_patterns'
  | 'decision_making_style'
  | 'goals_and_objectives'
  | 'constraints_and_boundaries'
  | 'operating_principles'
  | 'knowledge_assets'
  | 'intellectual_frameworks'
  | 'stakeholder_map'
  | 'audience_intelligence'
  | 'tool_and_technology_preferences'
  | 'model_preferences'
  | 'success_metrics'
  | 'temporal_patterns'
  | 'emotional_register'
  | 'learning_and_curiosity_patterns'
  | 'collaboration_and_leadership_style'
  | 'cultural_and_linguistic_context'
  | 'domain_specific_vocabulary'
  | 'competitive_intelligence'
  | 'personal_brand_signal';

/** Source: Architecture Section 3 (schema.sql comment), cross-checked against Taxonomy Section A — exactly 3 values appear across all 25 categories. */
export type StabilityClass = 'permanent' | 'long_term' | 'medium_term';

/** Derives from StabilityClass per Architecture Section 3 comment. */
export type DecayRate = 'none' | 'slow' | 'standard' | 'fast';

// ---- Intelligence Profile + Archetype ----------------------------------------

export interface IntelligenceProfile {
  id: string;
  /** ADR-003: nullable/discriminated the same way as `Learning.userId` — see that field's doc comment and `types/subject.ts`. */
  userId: UserId | null;
  /** ADR-003: new — a Workspace-subject profile (a Workspace's synthesized identity) has no `userId`. */
  workspaceId: string | null;
  subjectType: SubjectType;
  version: number;
  isCurrent: boolean;
  compositeConfidence: number;
  archetypePrimary: ArchetypeType | null;
  archetypeConfidence: number | null;
  voiceSummary: Record<string, unknown> | null;
  goalSummary: Record<string, unknown> | null;
  constraintSummary: Record<string, unknown> | null;
  preferenceSummary: Record<string, unknown> | null;
  expertiseDomains: Record<string, unknown> | null;
  vocabularySnapshot: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Logical Intelligence Schema B.1 lists 16 archetypes in its worked table;
 * that document's own prose elsewhere claims "17+". Left as an open union
 * rather than padded to a count neither source actually enumerates.
 */
export type ArchetypeType =
  | 'founder'
  | 'ceo_executive'
  | 'product_leader'
  | 'engineering_leader'
  | 'architect'
  | 'consultant'
  | 'researcher_scientist'
  | 'professor_educator'
  | 'student'
  | 'job_seeker'
  | 'writer_creator'
  | 'investor'
  | 'coach_advisor'
  | 'freelancer'
  | 'agency_operator'
  | 'enterprise_team_member'
  | string;

/**
 * New table, added per Sprint 0 sign-off (Logical Schema K.2: Archetype is
 * Phase-1-mandatory). `profiles.archetypePrimary` / `archetypeConfidence`
 * remain as a fast-read cache of whichever row here has `isPrimary: true` —
 * this table is the system of record, including non-primary candidates
 * (Phase 3: Multi-Archetype Weighting, not built here).
 */
export interface Archetype {
  id: string;
  userId: UserId;
  archetypeType: ArchetypeType;
  confidence: number;
  isPrimary: boolean;
  evidenceSummary: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Learning / Hypothesis / Signal ------------------------------------------

export type LearningState = 'VALIDATED' | 'CONFIRMED' | 'ACTIVE' | 'DECAYING' | 'FLAGGED' | 'ARCHIVED' | 'RETIRED';
export type LearningContextScope = 'global' | 'artifact_type' | 'project' | 'audience';

export interface Learning {
  id: string;
  /**
   * ADR-003 (Subject-Centric Intelligence): exactly one of `userId` /
   * `workspaceId` is non-null, discriminated by `subjectType`. Historically
   * this field was non-nullable (every Learning had a User subject);
   * migration 002 relaxed the database column, and ADR-003 promotes
   * Workspace to a first-class Subject that also owns Learning rows. See
   * `types/subject.ts`.
   */
  userId: UserId | null;
  workspaceId: string | null;
  /** Discriminates which of `userId`/`workspaceId` is this Learning's Subject. Defaults to 'user' for rows predating migration 004. */
  subjectType: SubjectType;
  projectId: string | null;
  domain: DomainType;
  taxonomyCategory: TaxonomyCategory;
  stabilityClass: StabilityClass;
  state: LearningState;
  confidence: number;
  contextScope: LearningContextScope;
  contextArtifactType: string | null;
  contextProjectId: string | null;
  contextAudienceType: string | null;
  content: Record<string, unknown>;
  sourceSummary: Record<string, unknown>;
  decayRate: DecayRate | null;
  lastConfirmedAt: Date | null;
  decayStartedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type HypothesisState = 'PROVISIONAL' | 'ACCUMULATING' | 'CHALLENGED' | 'VALIDATED' | 'DISCARDED' | 'REJECTED';

/**
 * Type only — no domain store method reads or writes this table in Sprint 0.
 * Hypothesis Engine (Sprint 2, explicitly out of scope) is the actual
 * writer. Defined here because `hypotheses` is one of the 11 real tables
 * and entities.ts is meant to cover the persisted shapes, but there is
 * intentionally no caller anywhere in this package yet.
 */
export interface Hypothesis {
  id: string;
  /** ADR-003: nullable/discriminated the same way as `Learning.userId` — see that field's doc comment and `types/subject.ts`. */
  userId: UserId | null;
  /** ADR-003: new — a Workspace-subject Hypothesis has no `userId`, so `workspace_id` is now tracked alongside it, mirroring `Learning.workspaceId`. */
  workspaceId: string | null;
  subjectType: SubjectType;
  projectId: string | null;
  taxonomyCategory: TaxonomyCategory;
  stabilityClass: StabilityClass;
  state: HypothesisState;
  confidence: number;
  requiredCorroborations: number;
  currentCorroborations: number;
  highQualityContradictions: number;
  proposition: Record<string, unknown>;
  contextScope: LearningContextScope;
  contextArtifactType: string | null;
  promotedLearningId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SignalSourceType = 'prompt' | 'feedback_event' | 'uploaded_artifact' | 'edit_diff' | 'explicit_statement' | 'behavioral';

/** Type only, same rationale as Hypothesis above — SignalExtractor (Sprint 2) is the writer. */
export interface Signal {
  id: string;
  /** ADR-003: nullable/discriminated the same way as `Learning.userId` — see that field's doc comment and `types/subject.ts`. */
  userId: UserId | null;
  /** ADR-003: new — a Workspace-subject Signal has no `userId`. */
  workspaceId: string | null;
  subjectType: SubjectType;
  projectId: string | null;
  sourceType: SignalSourceType;
  sourceRef: string | null;
  contextFlags: string[];
  taxonomyCategory: TaxonomyCategory | null;
  rawContent: Record<string, unknown>;
  isQuarantined: boolean;
  quarantineReason: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

// ---- Artifact Pattern / Exemplar ----------------------------------------------

export type ArtifactPatternLevel = 'universal' | 'archetype' | 'user_calibrated';

export interface ArtifactPattern {
  id: string;
  artifactType: string;
  patternLevel: ArtifactPatternLevel;
  userId: UserId | null;
  archetypeType: ArchetypeType | null;
  confidence: number;
  sections: Record<string, unknown>;
  narrativeModel: Record<string, unknown>;
  lengthBaseline: Record<string, unknown> | null;
  toneModel: Record<string, unknown> | null;
  exemplarCount: number;
  knownRejectionTriggers: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export type ExemplarPromotionReason = 'deployed' | 'explicitly_praised';

export interface ArtifactExemplar {
  id: string;
  userId: UserId;
  artifactType: string;
  sourceArtifactId: ArtifactId;
  promotionReason: ExemplarPromotionReason;
  structuralSnapshot: Record<string, unknown>;
  voiceSnapshot: Record<string, unknown> | null;
  audienceSnapshot: Record<string, unknown> | null;
  promotedAt: Date;
}

// ---- Knowledge Asset -------------------------------------------------------------

export type KnowledgeAssetOwnerType = 'user' | 'project' | 'workspace';
export type KnowledgeAssetType = 'playbook' | 'framework' | 'methodology' | 'template' | 'reference';

export interface KnowledgeAsset {
  id: string;
  ownerType: KnowledgeAssetOwnerType;
  userId: UserId | null;
  projectId: string | null;
  workspaceId: string | null;
  assetType: KnowledgeAssetType;
  title: string;
  sourceFileRef: string | null;
  extractedVocabulary: Record<string, unknown> | null;
  extractedPatterns: Record<string, unknown> | null;
  extractedFrameworks: Record<string, unknown> | null;
  /**
   * Structured visual feature extraction result (E1-4).
   * Null for non-visual assets or assets processed before E1-4.
   * Schema: ALTER TABLE intelligence.knowledge_assets
   *           ADD COLUMN IF NOT EXISTS extracted_visual_features JSONB;
   */
  extractedVisualFeatures: Record<string, unknown> | null;
  confidence: number;
  version: number;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Project --------------------------------------------------------------------

export type ProjectLifecycleState = 'IDEATION' | 'ACTIVE' | 'WIND_DOWN' | 'ARCHIVED';

export interface Project {
  id: string;
  userId: UserId;
  workspaceId: string | null;
  brandosProjectId: string | null;
  name: string;
  projectType: string | null;
  lifecycleState: ProjectLifecycleState;
  goals: unknown[];
  constraints: unknown[];
  vocabularyModel: Record<string, unknown>;
  stakeholders: unknown[];
  successCriteria: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Relationship (table exists; domain store deferred — see domains/RelationshipIntelligenceDomain.ts) --

export type RelationshipType = 'investor' | 'board' | 'client' | 'employee' | 'partner' | 'peer';
export type ExpertiseLevel = 'expert' | 'practitioner' | 'informed' | 'general';

export interface Relationship {
  id: string;
  userId: UserId;
  name: string;
  organization: string | null;
  relationshipType: RelationshipType | null;
  expertiseLevel: ExpertiseLevel | null;
  communicationNorms: Record<string, unknown> | null;
  knownSensitivities: Record<string, unknown> | null;
  confidence: number;
  lastInteractionAt: Date | null;
  decayStartedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Audience Profile ------------------------------------------------------------

export type AudienceProfileOwnerType = 'generic' | 'named';
export type AudienceType = 'board' | 'investor' | 'engineering' | 'customer' | 'general';

/**
 * New table, added per Sprint 0 sign-off. Source: Logical Intelligence
 * Schema B.14. `ownerType: 'generic'` is the Phase 1 substitute for named
 * Relationship calibration per Contracts J.2 — it's the only path Sprint
 * 1's AudienceCalibrator needs to read for Phase 1. `ownerType: 'named'`
 * (with relationshipId populated) is the Phase 2 path, once Relationship
 * Intelligence activates.
 */
export interface AudienceProfile {
  id: string;
  userId: UserId;
  ownerType: AudienceProfileOwnerType;
  relationshipId: string | null;
  audienceType: AudienceType | null;
  expertiseLevel: ExpertiseLevel;
  communicationNorms: Record<string, unknown>;
  knownSensitivities: Record<string, unknown>;
  confidence: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Workspace (minimal — see domains/WorkspaceIntelligenceDomain.ts) -----------

/**
 * No standalone table in Sprint 0. Per Contracts J.2, Phase 1 is
 * single-user-workspace only; the full multi-user governance shape is a
 * Phase 2 activation. This minimal shape is what
 * `WorkspaceIntelligenceDomain.getContext()` returns today.
 */
export interface WorkspaceContext {
  workspaceId: string;
  complianceConstraints: Record<string, unknown>[];
  /**
   * ADR-003 (Subject-Centric Intelligence) §2.4 — explicit, admin-declared
   * voice/persona overrides ingested via
   * `IntelligenceOS.ingestWorkspaceConfiguration()` and persisted as a
   * `KnowledgeAsset` (see `types/domains.ts`'s `WorkspaceConfigurationInput`).
   * `null` when no explicit configuration has been ingested for this
   * workspace — the honest "nothing declared yet" state, not an error.
   * `context/ContextBuilder.ts` treats this as Knowledge (top authority,
   * non-decaying) and applies it ahead of Learning-derived voice.
   */
  voiceConfiguration: Record<string, unknown> | null;
  /**
   * ADR-003 §2.3/§2.4 — explicit, admin-declared identity declarations
   * ingested via the same `IntelligenceOS.ingestWorkspaceConfiguration()`
   * call as `voiceConfiguration`, and persisted on the same `KnowledgeAsset`
   * row (`extracted_frameworks.identityConfiguration`). `null` when no
   * explicit identity has been declared — the honest "nothing declared
   * yet" state. `context/ContextBuilder.ts` applies this as Knowledge
   * (top authority, non-decaying) ahead of Learning-derived identity,
   * exactly the same relationship `voiceConfiguration` already has with
   * Learning-derived voice. Closes Completion Mission audit finding D-3.
   */
  identityConfiguration: Record<string, unknown> | null;
}

// ---- Feedback Event (persisted row) ----------------------------------------------

/**
 * The persisted row in intelligence.feedback_events. Distinct from
 * `FeedbackEvent` in @intelligence-os/shared-types, which is the
 * *input* shape BrandOS sends to `recordFeedbackEvent()` — this is what
 * that call writes, with server-generated fields added.
 */
export interface FeedbackEventRecord {
  id: string;
  userId: UserId;
  artifactId: ArtifactId;
  artifactType: string;
  projectId: string | null;
  eventType: 'accepted' | 'edited' | 'rejected' | 'deployed' | 'explicit_feedback';
  editDiff: Record<string, unknown> | null;
  explicitReason: string | null;
  signalsExtracted: boolean;
  blueprintRef: string | null;
  createdAt: Date;
}
