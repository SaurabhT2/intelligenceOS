/**
 * WorkspaceIntelligenceDomain.ts
 *
 * Owns: workspace-scoped intelligence (compliance constraints, shared vocabulary).
 * Reads knowledge assets with owner_type = 'workspace'.
 *
 * PARTIAL STUB — Phase 1 / Phase 2 split.
 *
 * Per Contracts Section J.2:
 *   Phase 1 (this domain):  single-user workspace only; getContext() returns
 *                           an empty compliance set (no constraints in Phase 1
 *                           unless a workspace-scoped knowledge asset declares them).
 *   Phase 2 (deferred):     multi-user governance, shared vocabulary enforcement,
 *                           standards board, Immutability Rule enforcement at the
 *                           workspace layer.
 *
 * The workspace table itself lives in BrandOS (not in the intelligence schema).
 * Intelligence OS stores workspace-scoped knowledge assets using
 * knowledge_assets.owner_type = 'workspace' + workspace_id.
 *
 * Sprint 0 scope:
 *   ✓ getContext()               — minimal real implementation (empty constraints)
 *   ✗ enforceComplianceConstraints() — stub (Phase 2 — full governance layer)
 *   ✗ syncSharedVocabulary()         — stub (Phase 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceContext, Learning } from '../types/entities';
import type { DomainType, WorkspaceLearningInput } from '../types/domains';
import { DatabaseError, PhaseNotImplementedError } from '../errors';

// ── Row shapes ────────────────────────────────────────────────────────────────

interface WorkspaceKnowledgeAssetRow {
  id: string;
  asset_type: string;
  title: string;
  extracted_frameworks: Record<string, unknown> | null;
  confidence: number;
}

interface WorkspaceLearningRow {
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

function mapToLearning(row: WorkspaceLearningRow): Learning {
  // ADR-003 (Subject-Centric Intelligence): every Learning this domain
  // reads is, by construction, workspace_id-filtered (see
  // `getWorkspaceLearnings()` below) — 'workspace' is not inferred here so
  // much as guaranteed by the query. `row.subject_type` (present on rows
  // written after migration 004) is honored when set, for consistency with
  // `UserIntelligenceDomain`'s identical mapper.
  const subjectType = row.subject_type ?? (row.workspace_id ? 'workspace' : 'user');
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    subjectType,
    projectId: row.project_id,
    domain: row.domain as Learning['domain'],
    taxonomyCategory: row.taxonomy_category as Learning['taxonomyCategory'],
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

export class WorkspaceIntelligenceDomain {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Returns the workspace intelligence context used by ConflictResolutionModel
   * to enforce the Immutability Rule (compliance constraints are never overridden),
   * and — ADR-003 (Subject-Centric Intelligence) §2.4 — by `context/ContextBuilder.ts`
   * to apply explicit, admin-declared voice configuration ahead of Learning-
   * derived voice.
   *
   * Phase 1 behaviour: reads workspace-scoped knowledge assets to check for
   * any declared compliance constraints and/or voice configuration. In most
   * Phase 1 deployments `complianceConstraints` will be empty and
   * `voiceConfiguration` will be null. The ConflictResolutionModel already
   * handles the empty compliance case gracefully (no Immutability Rule
   * enforcement needed when no constraints exist); `ContextBuilder` handles
   * a null `voiceConfiguration` the same way — nothing declared, fall
   * through to Learning-derived voice.
   *
   * Phase 2: this method will be replaced with a full governance lookup
   * against the workspace configuration, standards board, and shared vocabulary
   * model — all of which are Phase 2 activations.
   */
  async getContext(workspaceId: string): Promise<WorkspaceContext> {
    // Read workspace-scoped knowledge assets that declare compliance
    // frameworks and/or explicit voice/identity configuration. Any asset
    // with extracted_frameworks.complianceConstraints / .voiceConfiguration
    // / .identityConfiguration is treated as such a source — this is the
    // same single query `upsertWorkspaceConfiguration()`
    // (KnowledgeIntelligenceDomain) writes into and this method reads back
    // from, so no second read path was added for ADR-003 §2.4, and none
    // was added to close audit finding D-3 either.
    const { data, error } = await this.db
      .schema('intelligence')
      .from('knowledge_assets')
      .select('id, asset_type, title, extracted_frameworks, confidence')
      .eq('workspace_id', workspaceId)
      .eq('owner_type', 'workspace')
      .eq('is_current', true);

    if (error) {
      throw new DatabaseError(`Failed to fetch workspace context for ${workspaceId}`, error);
    }

    const rows = (data ?? []) as WorkspaceKnowledgeAssetRow[];

    // Extract compliance constraints from workspace knowledge assets.
    const complianceConstraints: Record<string, unknown>[] = rows
      .filter(row => row.extracted_frameworks?.complianceConstraints != null)
      .flatMap(row => {
        const constraints = row.extracted_frameworks!.complianceConstraints;
        return Array.isArray(constraints) ? constraints as Record<string, unknown>[] : [];
      });

    // ADR-003 §2.4: explicit voice configuration, if any workspace
    // knowledge asset declares one. `upsertWorkspaceConfiguration()`
    // maintains at most one current row for this, so "first found" is
    // equivalent to "the" configuration in the common case; if more than
    // one exists (e.g. a future direct write outside that method), the
    // most recently-confident declaration wins rather than silently
    // merging two admins' declarations together.
    const configRows = rows.filter(row => row.extracted_frameworks?.voiceConfiguration != null);
    const voiceConfiguration =
      configRows.length > 0
        ? (configRows.reduce((best, row) => (row.confidence > best.confidence ? row : best))
            .extracted_frameworks!.voiceConfiguration as Record<string, unknown>)
        : null;

    // ADR-003 §2.3/§2.4 — closes Completion Mission audit finding D-3.
    // Same read pattern as voiceConfiguration above: at most one workspace
    // knowledge asset carries a current identityConfiguration declaration
    // (upsertWorkspaceConfiguration() maintains one current row), highest-
    // confidence wins if more than one somehow exists.
    const identityConfigRows = rows.filter(row => row.extracted_frameworks?.identityConfiguration != null);
    const identityConfiguration =
      identityConfigRows.length > 0
        ? (identityConfigRows.reduce((best, row) => (row.confidence > best.confidence ? row : best))
            .extracted_frameworks!.identityConfiguration as Record<string, unknown>)
        : null;

    return { workspaceId, complianceConstraints, voiceConfiguration, identityConfiguration };
  }

  /**
   * Enforces workspace-level compliance constraints across all active projects.
   * DEFERRED — Phase 2 (multi-user governance, standards board).
   */
  async enforceComplianceConstraints(
    _workspaceId: string,
    _projectIds: string[],
  ): Promise<void> {
    throw new PhaseNotImplementedError(
      'WorkspaceIntelligenceDomain.enforceComplianceConstraints',
      'Phase 2 (Workspace Intelligence — multi-user governance)',
    );
  }

  /**
   * Synchronises shared vocabulary across all workspace members.
   * DEFERRED — Phase 2.
   */
  async syncSharedVocabulary(_workspaceId: string): Promise<void> {
    throw new PhaseNotImplementedError(
      'WorkspaceIntelligenceDomain.syncSharedVocabulary',
      'Phase 2 (Workspace Intelligence — multi-user governance)',
    );
  }

  // ── E1-2: Workspace-scoped Brand Voice ──────────────────────────────────────

  /**
   * Returns workspace-level learnings, optionally filtered by Intelligence Domain.
   *
   * These represent INFERRED, EVOLVING workspace-level style patterns (e.g. the
   * workspace consistently writes shorter copy than any individual member's
   * baseline). Do NOT call this for declared compliance constraints — those
   * live in getContext().complianceConstraints and do not decay.
   *
   * Source: Engineering Roadmap E1-2 Phase B.
   */
  async getWorkspaceLearnings(
    workspaceId: string,
    domain?: DomainType,
  ): Promise<Learning[]> {
    let query = this.db
      .schema('intelligence')
      .from('learnings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('state', ['VALIDATED', 'CONFIRMED', 'ACTIVE']);

    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data, error } = await query;
    if (error) {
      throw new DatabaseError(`Failed to fetch workspace learnings for ${workspaceId}`, error);
    }

    return (data ?? []).map((row: WorkspaceLearningRow) => mapToLearning(row));
  }

  /**
   * Upserts a workspace-level inferred style learning.
   *
   * Returns the id of the upserted learning.
   *
   * IMPORTANT: Only call this for inferred, evolving workspace patterns.
   * Declared compliance constraints must go through knowledge_assets with
   * extracted_frameworks.complianceConstraints, not through this method.
   *
   * Source: Engineering Roadmap E1-2 Phase B.
   */
  async upsertWorkspaceLearning(input: WorkspaceLearningInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const row = {
      id,
      // Workspace learnings use workspace_id; user_id is set to a sentinel
      // value for now (Phase B formal scope uses a synthetic workspace sentinel).
      // The sentinel pattern is: user_id IS NOT set (column is nullable in the
      // schema via the workspace-learning path — workspace learnings have no
      // owning user). However, the FK constraint requires a real auth.users
      // reference, so workspace learnings use a special workspace-scoped
      // write path via the knowledge_assets route or require the service-role
      // client to bypass RLS. For now we store workspace_id and leave user_id
      // as the caller-supplied sentinel or omit it.
      // Per E1-2 design note: this path will be refactored in Phase B proper.
      workspace_id:      input.workspaceId,
      domain:            input.domain,
      taxonomy_category: input.taxonomyCategory,
      stability_class:   input.stabilityClass,
      state:             'ACTIVE' as const,
      confidence:        input.confidence,
      context_scope:     'global' as const,
      content:           input.content,
      source_summary:    input.sourceSummary,
      created_at:        now,
      updated_at:        now,
    };

    const { data, error } = await this.db
      .schema('intelligence')
      .from('learnings')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      throw new DatabaseError(`Failed to upsert workspace learning for ${input.workspaceId}`, error);
    }

    return (data as { id: string }).id;
  }
}
