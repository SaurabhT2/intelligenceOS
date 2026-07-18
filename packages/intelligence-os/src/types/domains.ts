/**
 * domains.ts
 *
 * DomainType and domain-specific input / filter types.
 * These are internal to intelligence-os. BrandOS never imports from here —
 * it only imports from @intelligence-os/shared-types.
 *
 * Source: Logical Intelligence Schema F.1 (domain ownership table).
 */

export type DomainType =
  | 'user_intelligence'
  | 'project_intelligence'
  | 'artifact_intelligence'
  | 'knowledge_intelligence'
  | 'relationship_intelligence'
  | 'workspace_intelligence';

// ── Project ───────────────────────────────────────────────────────────────────

/**
 * Input for IntelligenceOS.upsertProject() / ProjectIntelligenceDomain.upsertProject().
 * `brandosProjectId` is the UUID from BrandOS's own projects table; when
 * provided, intelligence.projects.brandos_project_id is set (UNIQUE constraint)
 * so the two records stay correlated.
 */
export interface ProjectInput {
  userId: string;
  workspaceId?: string | null;
  brandosProjectId?: string | null;
  name: string;
  projectType?: string | null;
  lifecycleState?: 'IDEATION' | 'ACTIVE' | 'WIND_DOWN' | 'ARCHIVED';
}

// ── Knowledge Asset ───────────────────────────────────────────────────────────

/**
 * Input for IntelligenceOS.ingestKnowledgeAsset() (Sprint 3).
 * Defined here in Sprint 0 so the public API surface is stable.
 *
 * `'visual_asset'` added by the Cognitive Platform Evolution Program,
 * EM-2.4, per the Platform Ownership Review: "this asset is an image" is a
 * media-type distinction every future client needs identically, not a
 * BrandOS-flavored taxonomy value (contrast with the other five values,
 * which are BrandOS's own content vocabulary and were correctly NOT
 * generalized further — see EM-2.3's verdict in that review).
 * `VisualFeatureExtractor` requires no code change for this — its
 * `isVisualAsset` gating is already based on detected color/typography
 * signal count (`HEX_COLOR_RE`/`FONT_FAMILY_RE` matches), not on
 * `assetType`, so this value is additive classification metadata, not a
 * new code path. See that file's header and `KnowledgeProcessor.process()`,
 * which already calls the visual extractor unconditionally for every
 * asset.
 */
export interface KnowledgeAssetInput {
  ownerType: 'user' | 'project' | 'workspace';
  userId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  assetType: 'playbook' | 'framework' | 'methodology' | 'template' | 'reference' | 'visual_asset';
  title: string;
  sourceFileRef?: string | null;
}

export interface KnowledgeAssetFilter {
  userId?: string;
  projectId?: string;
  workspaceId?: string;
  ownerType?: 'user' | 'project' | 'workspace';
  assetType?: 'playbook' | 'framework' | 'methodology' | 'template' | 'reference' | 'visual_asset';
  isCurrent?: boolean;
}

// ── Artifact Exemplar ─────────────────────────────────────────────────────────

export interface ArtifactExemplarInput {
  userId: string;
  artifactType: string;
  sourceArtifactId: string;
  promotionReason: 'deployed' | 'explicitly_praised';
  structuralSnapshot: Record<string, unknown>;
  voiceSnapshot?: Record<string, unknown> | null;
  audienceSnapshot?: Record<string, unknown> | null;
}

// ── Workspace Learning  (E1-2) ─────────────────────────────────────────────────

/**
 * Input for WorkspaceIntelligenceDomain.upsertWorkspaceLearning() (E1-2).
 *
 * Design note (per Roadmap E1-2, Semantics Analysis refinement):
 *   Only INFERRED, EVOLVING workspace-level style patterns should use this
 *   path. Declared, non-decaying constraints (compliance disclaimers, banned
 *   phrases, mandated style rules) must be stored via
 *   WorkspaceIntelligenceDomain.getContext().complianceConstraints — they
 *   must never be written as workspace Learning rows, because the Learning
 *   decay machinery could silently weaken a hard constraint over time.
 */
export interface WorkspaceLearningInput {
  workspaceId: string;
  /** The intelligence domain this learning belongs to. */
  domain: DomainType;
  taxonomyCategory: import('../types/entities').TaxonomyCategory;
  stabilityClass: import('../types/entities').StabilityClass;
  confidence: number;
  content: Record<string, unknown>;
  sourceSummary: Record<string, unknown>;
}

// ── Workspace Configuration (ADR-003 §2.4) ──────────────────────────────────

/**
 * Input for `IntelligenceOS.ingestWorkspaceConfiguration()` /
 * `KnowledgeIntelligenceDomain.upsertWorkspaceConfiguration()`.
 *
 * ADR-003 §2.4 names explicit, admin-declared workspace configuration
 * (a persona/brand-voice override, a compliance requirement) as
 * **Knowledge**, not Experience: it doesn't require corroboration to be
 * trusted, it requires provenance — the same reasoning that already governs
 * `KnowledgeAsset`. This is the narrow, explicit, provenance-carrying
 * ingestion path `ROADMAP.md`'s "Mid-term (subject-centric intelligence)"
 * section calls for, modeled on the existing Knowledge Ingest route rather
 * than bolted onto the Learning Pipeline or a new `CognitionProvider`
 * method (which `PLATFORM_CONTRACT.md` §5 forbids — "no sixth operation
 * should ever be added to serve a specific feature").
 *
 * Persisted as a `KnowledgeAsset` (`owner_type: 'workspace'`,
 * `asset_type: 'reference'`) rather than a `Learning` row — it never decays
 * and never needs corroboration, which is exactly what `KnowledgeAsset`
 * already models and `Learning` does not.
 */
export interface WorkspaceConfigurationInput {
  workspaceId: string;
  /** Human-readable label for this configuration snapshot (e.g. the admin who set it, or a change note). Optional. */
  label?: string | null;
  /**
   * Explicit voice/persona overrides. Shape mirrors the voice-relevant
   * subset of `@platform/cognition-contract`'s `VoiceProfile` deliberately
   * (see `context/ContextBuilder.ts`, which reads this as the top-authority
   * input to voice synthesis) — but this type lives in `intelligence-os`,
   * not the contract package, because it is an *ingestion* shape, not a
   * cross-boundary projection.
   */
  voiceConfiguration?: {
    tone?: string;
    cadence?: 'short' | 'medium' | 'long' | 'varied';
    audienceType?: string;
    executiveLevel?: boolean;
    domain?: string;
    bannedPhrases?: string[];
    brandName?: string;
    voiceDescriptor?: string;
    audiencePositioning?: string;
  } | null;
  /** Declared, non-decaying compliance requirements — same shape `WorkspaceIntelligenceDomain.getContext()` already returns via `extractedFrameworks.complianceConstraints`. */
  complianceConstraints?: Record<string, unknown>[];
  /**
   * Explicit identity declarations — ADR-003 §2.3's "Knowledge contributes
   * explicit identity declarations" half, closing the gap the Completion
   * Mission audit identified as D-3 (identity synthesis previously drew
   * only from Experience/`Learning`, never from Knowledge, despite §2.3's
   * own text promising both). Shape mirrors `@platform/cognition-contract`'s
   * `IdentityContribution` deliberately, for the same reason
   * `voiceConfiguration` above mirrors `VoiceProfile` — but lives here as
   * an *ingestion* shape, not the contract projection itself.
   *
   * Applied by `context/ContextBuilder.ts` (`applyIdentityConfiguration()`)
   * ahead of `identitySynthesis.ts`'s Learning-derived identity, exactly
   * the same authority relationship `applyVoiceConfiguration()` already
   * has with Learning-derived voice: an explicit declaration is Knowledge
   * (provenance, no corroboration needed) and outranks an inferred pattern
   * (Experience, corroboration-gated).
   */
  identityConfiguration?: {
    brandName?: string;
    narrativeArcs?: string[];
    argumentationStyle?: string;
    namedFrameworks?: string[];
    preferredLength?: 'short' | 'medium' | 'long';
  } | null;
}

// ── User Correction ───────────────────────────────────────────────────────────

/**
 * Input for `IntelligenceOS.recordCorrection()` — the emitter half of
 * `intelligence.user.correction` (Contracts B.2: corrections are the
 * highest-authority signal in the system, bypassing the Signal →
 * Observation → Hypothesis quarantine gate entirely). The handler side
 * (`FeedbackProcessor.processCorrection()` → `LearningValidator.maybeConfirm()`)
 * has existed and been tested since before this method — see
 * `tests/unit/pipeline/UserCorrection.test.ts` — this type and the method
 * below are the considered, separately-reviewed public-contract addition
 * `ARCHITECTURE.md` §11 Rule 7 asks for, following the same additive,
 * non-breaking treatment `ingestWorkspaceConfiguration()` received.
 *
 * Deliberately the same field set as `UserCorrectionPayload`
 * (`types/events.ts`) minus `occurredAt`, which `recordCorrection()` stamps
 * itself — the same relationship `FeedbackEvent` (a consumer-facing input
 * type) has to its own emitted event payload.
 */
export interface UserCorrectionInput {
  userId: string;
  correctionType: 'vocabulary' | 'tone' | 'style' | 'fact' | 'goal' | 'other';
  /**
   * The taxonomy category the correction applies to. `LearningValidator
   * .maybeConfirm()` can only confirm an existing VALIDATED Learning for a
   * specific category, so a correction with no category has nothing to
   * confirm against and is a documented no-op, not an error — see
   * `FeedbackProcessor.processCorrection()`.
   */
  taxonomyCategory?: string | null;
  correctedValue: unknown;
  context?: string | null;
}
