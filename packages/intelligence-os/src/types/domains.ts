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
 */
export interface KnowledgeAssetInput {
  ownerType: 'user' | 'project' | 'workspace';
  userId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  assetType: 'playbook' | 'framework' | 'methodology' | 'template' | 'reference';
  title: string;
  sourceFileRef?: string | null;
}

export interface KnowledgeAssetFilter {
  userId?: string;
  projectId?: string;
  workspaceId?: string;
  ownerType?: 'user' | 'project' | 'workspace';
  assetType?: 'playbook' | 'framework' | 'methodology' | 'template' | 'reference';
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
