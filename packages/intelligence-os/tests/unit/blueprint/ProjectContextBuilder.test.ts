/**
 * ProjectContextBuilder.test.ts
 *
 * Dedicated unit tests for ProjectContextBuilder, which assembles the
 * project-scoped intelligence BlueprintBuilder's Step 1 needs. Closes part
 * of the test-coverage gap `IMPLEMENTATION_STATUS.md`/`ROADMAP.md` flag —
 * previously only exercised indirectly through BlueprintBuilder's own
 * integration-style tests. Covers: the four-fetch fail-soft pattern and its
 * `degraded` flag (Epic 2 / E2-1-T1), the skip-vs-fail distinction
 * (`trackedCatch` vs `skipped`), and the project/global learning-scope
 * filter.
 */

import { describe, it, expect, vi } from 'vitest';
import { ProjectContextBuilder, EMPTY_PROJECT_CONTEXT } from '../../../src/blueprint/ProjectContextBuilder';
import type { ProjectIntelligenceDomain } from '../../../src/domains/ProjectIntelligenceDomain';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';
import type { Project, WorkspaceContext, Learning, KnowledgeAsset } from '../../../src/types/entities';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', userId: 'user-1', workspaceId: null, brandosProjectId: null,
    name: 'Q3 Board Deck', projectType: 'board_update', lifecycleState: 'ACTIVE',
    goals: [{ text: 'Close Series B' }], constraints: [{ text: 'No forward guidance' }],
    vocabularyModel: { tone: 'direct' }, stakeholders: [{ name: 'Board' }],
    successCriteria: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeWorkspaceContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    workspaceId: 'ws-1',
    complianceConstraints: [],
    voiceConfiguration: null,
    identityConfiguration: null,
    ...overrides,
  } as WorkspaceContext;
}

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1', userId: 'user-1', workspaceId: null, subjectType: 'user', projectId: null,
    domain: 'project_intelligence', taxonomyCategory: 'goals_and_objectives',
    stabilityClass: 'long_term', state: 'VALIDATED', confidence: 0.7,
    contextScope: 'global', contextArtifactType: null, contextProjectId: null,
    contextAudienceType: null, content: {}, sourceSummary: {}, decayRate: 'slow',
    lastConfirmedAt: new Date(), decayStartedAt: null, archivedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeKnowledgeAsset(overrides: Partial<KnowledgeAsset> = {}): KnowledgeAsset {
  return {
    id: 'asset-1', ownerType: 'user', userId: 'user-1', projectId: null, workspaceId: null,
    assetType: 'reference', title: 'Style guide', sourceFileRef: null,
    extractedVocabulary: null, extractedPatterns: null, extractedFrameworks: null,
    extractedVisualFeatures: null, confidence: 0.8, version: 1, isCurrent: true,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeBuilder(opts: {
  project?: Project | null;
  projectError?: boolean;
  workspaceContext?: WorkspaceContext | null;
  workspaceError?: boolean;
  learnings?: Learning[];
  learningsError?: boolean;
  knowledgeAssets?: KnowledgeAsset[];
  knowledgeError?: boolean;
} = {}) {
  const projectDomain = {
    getProject: vi.fn().mockImplementation(async () => {
      if (opts.projectError) throw new Error('project fetch failed');
      return opts.project ?? null;
    }),
  } as unknown as ProjectIntelligenceDomain;

  const userDomain = {
    getActiveLearnings: vi.fn().mockImplementation(async () => {
      if (opts.learningsError) throw new Error('learnings fetch failed');
      return opts.learnings ?? [];
    }),
  } as unknown as UserIntelligenceDomain;

  const workspaceDomain = {
    getContext: vi.fn().mockImplementation(async () => {
      if (opts.workspaceError) throw new Error('workspace fetch failed');
      return opts.workspaceContext ?? makeWorkspaceContext();
    }),
  } as unknown as WorkspaceIntelligenceDomain;

  const knowledgeDomain = {
    getAssets: vi.fn().mockImplementation(async () => {
      if (opts.knowledgeError) throw new Error('knowledge fetch failed');
      return opts.knowledgeAssets ?? [];
    }),
  } as unknown as KnowledgeIntelligenceDomain;

  return {
    builder: new ProjectContextBuilder(projectDomain, userDomain, workspaceDomain, knowledgeDomain),
    projectDomain,
    userDomain,
    workspaceDomain,
    knowledgeDomain,
  };
}

describe('ProjectContextBuilder — skip vs fail (degraded flag)', () => {
  it('does not mark degraded, and does not call getProject/getContext, when no projectId/workspaceId is given', async () => {
    const { builder, projectDomain, workspaceDomain } = makeBuilder();

    const ctx = await builder.build('user-1', null, null);

    expect(ctx.degraded).toBe(false);
    expect(ctx.project).toBeNull();
    expect(ctx.workspaceContext).toBeNull();
    expect(projectDomain.getProject).not.toHaveBeenCalled();
    expect(workspaceDomain.getContext).not.toHaveBeenCalled();
  });

  it('marks degraded when the project fetch throws, and falls back to null', async () => {
    const { builder } = makeBuilder({ projectError: true });

    const ctx = await builder.build('user-1', 'proj-1', null);

    expect(ctx.degraded).toBe(true);
    expect(ctx.project).toBeNull();
  });

  it('marks degraded when the workspace fetch throws, independent of the project fetch succeeding', async () => {
    const { builder } = makeBuilder({ project: makeProject(), workspaceError: true });

    const ctx = await builder.build('user-1', 'proj-1', 'ws-1');

    expect(ctx.degraded).toBe(true);
    expect(ctx.workspaceContext).toBeNull();
    expect(ctx.project).not.toBeNull(); // the successful fetch is unaffected
  });

  it('marks degraded when the learnings fetch throws', async () => {
    const { builder } = makeBuilder({ learningsError: true });

    const ctx = await builder.build('user-1', null, null);

    expect(ctx.degraded).toBe(true);
    expect(ctx.learnings).toEqual([]);
  });

  it('marks degraded when the knowledge-assets fetch throws', async () => {
    const { builder } = makeBuilder({ knowledgeError: true });

    const ctx = await builder.build('user-1', null, null);

    expect(ctx.degraded).toBe(true);
    expect(ctx.knowledgeAssets).toEqual([]);
  });

  it('is not degraded when every fetch succeeds', async () => {
    const { builder } = makeBuilder({
      project: makeProject(),
      workspaceContext: makeWorkspaceContext(),
      learnings: [makeLearning()],
      knowledgeAssets: [makeKnowledgeAsset()],
    });

    const ctx = await builder.build('user-1', 'proj-1', 'ws-1');

    expect(ctx.degraded).toBe(false);
  });
});

describe('ProjectContextBuilder — project field projection', () => {
  it('projects goals/constraints/vocabularyModel/stakeholders/lifecycleState from the loaded project', async () => {
    const project = makeProject({
      goals: [{ text: 'Grow ARR' }],
      constraints: [{ text: 'No layoffs' }],
      vocabularyModel: { tone: 'confident' },
      stakeholders: [{ name: 'CFO' }],
      lifecycleState: 'ACTIVE',
    });
    const { builder } = makeBuilder({ project });

    const ctx = await builder.build('user-1', 'proj-1', null);

    expect(ctx.goals).toEqual([{ text: 'Grow ARR' }]);
    expect(ctx.constraints).toEqual([{ text: 'No layoffs' }]);
    expect(ctx.vocabularyModel).toEqual({ tone: 'confident' });
    expect(ctx.stakeholders).toEqual([{ name: 'CFO' }]);
    expect(ctx.lifecycleState).toBe('ACTIVE');
  });

  it('falls back to empty defaults for every project field when no project is found', async () => {
    const { builder } = makeBuilder({ project: null });

    const ctx = await builder.build('user-1', null, null);

    expect(ctx.goals).toEqual([]);
    expect(ctx.constraints).toEqual([]);
    expect(ctx.vocabularyModel).toEqual({});
    expect(ctx.stakeholders).toEqual([]);
    expect(ctx.lifecycleState).toBeNull();
  });
});

describe('ProjectContextBuilder — learning scope filter', () => {
  it('includes both project-scoped and global learnings when a projectId is given', async () => {
    const learnings = [
      makeLearning({ id: 'l1', contextProjectId: 'proj-1', contextScope: 'project' }),
      makeLearning({ id: 'l2', contextProjectId: null, contextScope: 'global' }),
      makeLearning({ id: 'l3', contextProjectId: 'other-proj', contextScope: 'project' }),
    ];
    const { builder } = makeBuilder({ project: makeProject(), learnings });

    const ctx = await builder.build('user-1', 'proj-1', null);

    expect(ctx.learnings.map(l => l.id).sort()).toEqual(['l1', 'l2']);
  });

  it('includes only global learnings when no projectId is given', async () => {
    const learnings = [
      makeLearning({ id: 'l1', contextProjectId: 'proj-1', contextScope: 'project' }),
      makeLearning({ id: 'l2', contextProjectId: null, contextScope: 'global' }),
    ];
    const { builder } = makeBuilder({ learnings });

    const ctx = await builder.build('user-1', null, null);

    expect(ctx.learnings.map(l => l.id)).toEqual(['l2']);
  });
});

describe('ProjectContextBuilder — knowledge assets and EMPTY_PROJECT_CONTEXT', () => {
  it('passes knowledge assets through unfiltered for vocabulary enrichment', async () => {
    const assets = [makeKnowledgeAsset({ id: 'a1' }), makeKnowledgeAsset({ id: 'a2' })];
    const { builder, knowledgeDomain } = makeBuilder({ knowledgeAssets: assets });

    const ctx = await builder.build('user-1', null, null);

    expect(ctx.knowledgeAssets.map(a => a.id)).toEqual(['a1', 'a2']);
    expect(knowledgeDomain.getAssets).toHaveBeenCalledWith({ userId: 'user-1', isCurrent: true });
  });

  it('EMPTY_PROJECT_CONTEXT matches the shape build() returns for a brand-new user with no project', async () => {
    const { builder } = makeBuilder();

    const ctx = await builder.build('user-1', null, null);

    expect(ctx).toEqual(EMPTY_PROJECT_CONTEXT);
  });
});
