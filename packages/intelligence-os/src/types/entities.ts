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

/**
 * ADR-004 (Cognitive Consolidation) — provenance-carrying element of a
 * `SynthesizedCollection`. Every item traces to exactly one concrete
 * `Learning` or `KnowledgeAsset` row (`sourceId`) — never a blended,
 * anonymous aggregate. See ADR-004 §7.4.
 */
export interface SynthesizedItem<T> {
  value: T;
  /** 0-1, same scale as `Learning.confidence` / `KnowledgeAsset.confidence`. */
  confidence: number;
  /** Which of the two ADR-003 inputs this item came from. */
  sourceKind: 'knowledge' | 'experience';
  /** The specific `Learning.id` or `KnowledgeAsset.id` this item was derived from. */
  sourceId: string;
  /** ISO 8601 timestamp of the source row's `createdAt` — used for recency tie-breaking (ADR-004 §7.3). */
  sourceObservedAt: string;
}

/**
 * ADR-004 (Cognitive Consolidation) — shared shape for every
 * `IntelligenceProfile` field that represents a *collection* of synthesized
 * items, combined via the union-with-provenance rule (ADR-004 §7.1), as
 * opposed to `voiceSummary`/`goalSummary`/etc. below, which remain plain
 * field-merge `Record`s combined via the override rule (ADR-003/ADR-004
 * §7.2). The two shapes deliberately coexist on this entity — see ADR-004
 * §0.2/§4.6 for why retrofitting the older fields to this shape is
 * separately-scoped follow-up work, not part of this change.
 */
export interface SynthesizedCollection<T> {
  items: SynthesizedItem<T>[];
  /** The maximum confidence across `items` — not an average (ADR-004 §4.2: a highly-confident single item shouldn't be diluted by several low-confidence ones sharing the same field). */
  confidence: number;
  /** True when `items` contains a real, origin-signaled conflict (ADR-004 §7.3) — reused from each source's own existing contradiction signal, never computed fresh at this layer. */
  hasConflict: boolean;
}

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
  /** ADR-004: computation corrected to also read Knowledge (`KnowledgeAsset.extractedVocabulary`), not only Experience — same field, same type, see ADR-004 §5. */
  vocabularySnapshot: Record<string, unknown> | null;
  /** ADR-004 (Cognitive Consolidation) — recurring themes and named frameworks. Sourced from Learnings tagged `intellectual_frameworks`/`knowledge_assets` AND `KnowledgeAsset.extractedFrameworks`. See ADR-004 §5.2. */
  knowledgeSummary: SynthesizedCollection<{ name: string; description: string }> | null;
  /** ADR-004 (Cognitive Consolidation) — declared/demonstrated reasoning and decision-making conclusions. Sourced from Learnings tagged `strategic_thinking_patterns`/`decision_making_style`/`operating_principles` AND `KnowledgeAsset.extractedFrameworks` items categorized 'analytical'/'evaluative'. See ADR-004 §5.3. */
  reasoningSummary: SynthesizedCollection<{ statement: string }> | null;
  /** ADR-004 (Cognitive Consolidation) — market/category standing. Experience-only at launch (ADR-004 §0.1): sourced from Learnings tagged `competitive_intelligence`. No Knowledge-side extractor exists yet for this field — see ADR-004 §5 for why this is a deliberate, documented scope decision, not an oversight. */
  positioningSummary: SynthesizedCollection<{ statement: string }> | null;
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
  /**
   * Evidence/Identity Bridge (ADR-005) — append-only audit trail, one
   * `EvidenceRecord` per Observation applied to this Hypothesis (see
   * `HypothesisEngine.computeCorroborationUpdates`/
   * `computeContradictionUpdates`). Never read by promotion-threshold math
   * (`current_corroborations`/`required_corroborations`/
   * `high_quality_contradictions` remain the sole gating fields, unchanged)
   * — this exists purely so a promoted Learning (and, before promotion, the
   * Hypothesis itself) stays explainable: which sources contributed, which
   * frameworks/vocabulary/observations supported it, and at what confidence.
   * Copied verbatim into `Learning.sourceSummary.evidenceTrail` on
   * promotion. See migration 007_evidence_provenance.sql.
   */
  evidenceTrail: EvidenceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Evidence/Identity Bridge (ADR-005) — a single, source-agnostic unit of
 * provenance for one Observation applied to a Hypothesis. Deliberately
 * shaped so it never assumes the evidence came from an uploaded document:
 * `sourceKind` is an open set precisely so future evidence producers
 * (connectors, web imports, repositories, conversations) plug into the same
 * audit trail without a schema change — only a new `sourceKind` value and a
 * new adapter that produces `EvidenceSourceInput` (see
 * `pipeline/EvidenceExtractor.ts`).
 */
export interface EvidenceRecord {
  sourceKind: EvidenceSourceKind;
  /** Id of the originating record in its own domain — e.g. a knowledge_assets.id, a connector sync id, a feedback_events.artifact_id. */
  sourceId: string;
  /** Human-readable label for explainability surfaces — e.g. the document's title/filename. Optional: not every source kind has one yet. */
  sourceLabel?: string;
  taxonomyCategory: TaxonomyCategory;
  /**
   * The specific items that supported this evidence — framework names,
   * vocabulary terms/phrases, or a short human-readable description of a
   * behavioral signal (e.g. "artifact accepted without edits"). Always
   * populated with something concrete; never a bare confidence number with
   * no explanation of *what* was observed.
   */
  supportingItems: string[];
  /** Confidence of this specific Observation (already ceiling-capped by SOURCE_QUALITY_CEILING at the point this record was created). */
  confidence: number;
  disposition: 'corroborating' | 'contradicting' | 'new';
  observedAt: string;
}

/**
 * Evidence/Identity Bridge (ADR-005) — open set of evidence origins. Add a
 * new value here (never remove/rename an existing one — it's persisted
 * verbatim in `evidence_trail`/`source_summary` JSONB) when a new evidence
 * producer is built. `'experience'` covers the pre-existing
 * feedback/observation pipeline, kept distinct from `'knowledge_asset'` so
 * an explanation surface can always answer "did this trait come from a
 * document or from artifact feedback?".
 */
export type EvidenceSourceKind =
  | 'knowledge_asset'
  | 'connector'
  | 'web_import'
  | 'repository'
  | 'conversation'
  | 'experience';

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
export type KnowledgeAssetType = 'playbook' | 'framework' | 'methodology' | 'template' | 'reference' | 'visual_asset';

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
  /**
   * How much this ingestion expanded the workspace's knowledge surface —
   * see knowledge/types.ts's ContributionSummary for the shape and
   * knowledge/ContributionScorer.ts for how it's computed. Descriptive
   * only; never gates or is gated by the Evidence/Identity Bridge
   * (ADR-005). Null for assets processed before this field existed.
   * Schema: ALTER TABLE intelligence.knowledge_assets
   *           ADD COLUMN IF NOT EXISTS contribution_summary JSONB;
   */
  contributionSummary: Record<string, unknown> | null;
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
