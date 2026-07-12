/**
 * ProjectContextBuilder.ts
 *
 * Assembles all project-scoped intelligence needed by BlueprintBuilder.
 *
 * Responsibilities (Sprint 1 scope):
 *   • Load the intelligence project record (if projectId provided)
 *   • Load workspace context (if workspaceId provided)
 *   • Load project-scoped learnings from User Intelligence domain
 *   • Load knowledge assets for vocabulary enrichment
 *
 * All domain calls use .catch(() => fallback) — missing data is normal and
 * must not fail blueprint generation for new users or empty projects.
 *
 * Constraint: all intelligence access goes through domain APIs.
 * Direct Supabase queries are forbidden here.
 */

import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { ProjectIntelligenceDomain } from '../domains/ProjectIntelligenceDomain';
import type { WorkspaceIntelligenceDomain } from '../domains/WorkspaceIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../domains/KnowledgeIntelligenceDomain';
import type { Project, WorkspaceContext, Learning, KnowledgeAsset } from '../types/entities';
import { trackedCatch, skipped } from './internal/trackedFetch';

export interface ProjectContext {
  project:          Project | null;
  goals:            unknown[];
  constraints:      unknown[];
  vocabularyModel:  Record<string, unknown>;
  stakeholders:     unknown[];
  lifecycleState:   string | null;
  workspaceContext: WorkspaceContext | null;
  /** Active learnings scoped to this project (or global learnings when no project). */
  learnings:        Learning[];
  /** Knowledge assets available for vocabulary enrichment. */
  knowledgeAssets:  KnowledgeAsset[];
  /** True when one or more of the four fetches below errored and fell back
   *  to its fail-soft default (Epic 2 / E2-1-T1). False for the "no
   *  projectId/workspaceId provided" case — that's a skip, not a failure. */
  degraded:         boolean;
}

/** Empty context returned for new users with no project. */
export const EMPTY_PROJECT_CONTEXT: ProjectContext = {
  project:          null,
  goals:            [],
  constraints:      [],
  vocabularyModel:  {},
  stakeholders:     [],
  lifecycleState:   null,
  workspaceContext: null,
  learnings:        [],
  knowledgeAssets:  [],
  degraded:         false,
};

export class ProjectContextBuilder {
  constructor(
    private readonly projectDomain:   ProjectIntelligenceDomain,
    private readonly userDomain:      UserIntelligenceDomain,
    private readonly workspaceDomain: WorkspaceIntelligenceDomain,
    private readonly knowledgeDomain: KnowledgeIntelligenceDomain,
  ) {}

  async build(
    userId:      string,
    projectId:   string | null | undefined,
    workspaceId: string | null | undefined,
  ): Promise<ProjectContext> {
    // Parallel fetch — failures degrade gracefully to nulls/empty arrays,
    // and trackedCatch records whether that fallback actually fired.
    const [projectR, workspaceR, learningsR, knowledgeR] = await Promise.all([
      projectId
        ? trackedCatch(this.projectDomain.getProject(projectId), null)
        : skipped<Project | null>(null),

      workspaceId
        ? trackedCatch(this.workspaceDomain.getContext(workspaceId), null)
        : skipped<WorkspaceContext | null>(null),

      trackedCatch(
        this.userDomain.getActiveLearnings(userId, 'project_intelligence'),
        [] as Learning[],
      ),

      trackedCatch(
        this.knowledgeDomain.getAssets({ userId, isCurrent: true }),
        [] as KnowledgeAsset[],
      ),
    ]);

    const project          = projectR.value;
    const workspaceContext = workspaceR.value;
    const learnings         = learningsR.value;
    const knowledgeAssets   = knowledgeR.value;
    const degraded = projectR.failed || workspaceR.failed || learningsR.failed || knowledgeR.failed;

    // Filter learnings to those relevant to this project
    const relevantLearnings = projectId
      ? learnings.filter(
          l =>
            l.contextProjectId === projectId ||
            l.contextScope === 'global',
        )
      : learnings.filter(l => l.contextScope === 'global');

    return {
      project,
      goals:            project?.goals ?? [],
      constraints:      project?.constraints ?? [],
      vocabularyModel:  project?.vocabularyModel ?? {},
      stakeholders:     project?.stakeholders ?? [],
      lifecycleState:   project?.lifecycleState ?? null,
      workspaceContext,
      learnings:        relevantLearnings,
      knowledgeAssets,
      degraded,
    };
  }
}
