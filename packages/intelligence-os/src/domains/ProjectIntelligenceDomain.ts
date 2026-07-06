/**
 * ProjectIntelligenceDomain.ts
 *
 * Owns: intelligence.projects
 * No other domain may write to this table.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 4.
 *
 * Sprint 0 scope:
 *   ✓ getProject()      — real Supabase read
 *   ✓ upsertProject()   — real Supabase write (needed for IntelligenceOS.upsertProject())
 *   ✗ updateLifecycle() — stub (Sprint 2+ when project state machine activates)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '../types/entities';
import type { ProjectInput } from '../types/domains';
import { DatabaseError, EntityNotFoundError, PhaseNotImplementedError } from '../errors';

// ── Row shape ─────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  brandos_project_id: string | null;
  name: string;
  project_type: string | null;
  lifecycle_state: string;
  goals: unknown[];
  constraints: unknown[];
  vocabulary_model: Record<string, unknown>;
  stakeholders: unknown[];
  success_criteria: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    brandosProjectId: row.brandos_project_id,
    name: row.name,
    projectType: row.project_type,
    lifecycleState: row.lifecycle_state as Project['lifecycleState'],
    goals: row.goals,
    constraints: row.constraints,
    vocabularyModel: row.vocabulary_model,
    stakeholders: row.stakeholders,
    successCriteria: row.success_criteria,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Domain class ──────────────────────────────────────────────────────────────

export class ProjectIntelligenceDomain {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Returns a project by its intelligence-os id, or null if not found.
   */
  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch project ${projectId}`, error);
    return data ? mapToProject(data as ProjectRow) : null;
  }

  /**
   * Returns the intelligence project correlated to a BrandOS project id,
   * or null if no correlation exists yet.
   */
  async getProjectByBrandosId(brandosProjectId: string): Promise<Project | null> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('projects')
      .select('*')
      .eq('brandos_project_id', brandosProjectId)
      .maybeSingle();

    if (error) throw new DatabaseError(`Failed to fetch project by brandos_project_id ${brandosProjectId}`, error);
    return data ? mapToProject(data as ProjectRow) : null;
  }

  /**
   * Lists all active projects for a user.
   */
  async getActiveProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.db
      .schema('intelligence')
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .in('lifecycle_state', ['IDEATION', 'ACTIVE']);

    if (error) throw new DatabaseError(`Failed to fetch active projects for user ${userId}`, error);
    return (data ?? []).map((row: ProjectRow) => mapToProject(row));
  }

  /**
   * Creates or updates an intelligence project record.
   *
   * If `brandosProjectId` is provided, the operation is an upsert on the
   * `brandos_project_id` UNIQUE column so BrandOS events are idempotent
   * (intelligence.project.created may fire more than once safely).
   *
   * Returns the project id.
   */
  async upsertProject(input: ProjectInput): Promise<string> {
    const payload = {
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      brandos_project_id: input.brandosProjectId ?? null,
      name: input.name,
      project_type: input.projectType ?? null,
      lifecycle_state: input.lifecycleState ?? 'IDEATION',
      updated_at: new Date().toISOString(),
    };

    if (input.brandosProjectId) {
      // Upsert keyed on brandos_project_id so BrandOS events are idempotent.
      const { data, error } = await this.db
        .schema('intelligence')
        .from('projects')
        .upsert(payload, { onConflict: 'brandos_project_id', ignoreDuplicates: false })
        .select('id')
        .single();

      if (error) throw new DatabaseError('Failed to upsert project', error);
      return (data as { id: string }).id;
    }

    // No BrandOS id — plain insert.
    const { data, error } = await this.db
      .schema('intelligence')
      .from('projects')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw new DatabaseError('Failed to insert project', error);
    return (data as { id: string }).id;
  }

  /**
   * Transitions a project's lifecycle state.
   * DEFERRED — full project state machine activates in Sprint 2+.
   */
  async updateLifecycleState(
    _projectId: string,
    _state: Project['lifecycleState'],
  ): Promise<void> {
    throw new PhaseNotImplementedError(
      'ProjectIntelligenceDomain.updateLifecycleState',
      'Sprint 2 (Learning Pipeline)',
    );
  }

  /**
   * Returns a project by id, throwing EntityNotFoundError if it doesn't exist.
   * Convenience wrapper used by blueprint assembly (Sprint 1).
   */
  async requireProject(projectId: string): Promise<Project> {
    const project = await this.getProject(projectId);
    if (!project) throw new EntityNotFoundError('Project', projectId);
    return project;
  }
}
