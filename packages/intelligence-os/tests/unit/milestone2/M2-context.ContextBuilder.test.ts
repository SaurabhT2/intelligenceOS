/**
 * M2-context.ContextBuilder.test.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 */

import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from '../../../src/context/ContextBuilder';
import { COGNITION_CONTRACT_VERSION } from '@platform/cognition-contract';
import type { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { Learning } from '../../../src/types/entities';

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1',
    userId: 'user-1',
    workspaceId: 'ws-1',
    projectId: null,
    domain: 'artifact_intelligence',
    taxonomyCategory: 'writing_style',
    stabilityClass: 'medium_term',
    state: 'ACTIVE',
    confidence: 0.85,
    contextScope: 'global',
    contextArtifactType: null,
    contextProjectId: null,
    contextAudienceType: null,
    content: { tone: 'authoritative' },
    sourceSummary: {},
    decayRate: 'standard',
    lastConfirmedAt: null,
    decayStartedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

function makeWorkspaceDomain(learnings: Learning[]): WorkspaceIntelligenceDomain {
  return {
    getWorkspaceLearnings: vi.fn().mockResolvedValue(learnings),
  } as unknown as WorkspaceIntelligenceDomain;
}

describe('ContextBuilder.build()', () => {
  it('returns a fully-shaped CognitionContext with the current contract version', async () => {
    const workspace = makeWorkspaceDomain([makeLearning()]);
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.contractVersion).toBe(COGNITION_CONTRACT_VERSION);
    expect(context.workspaceId).toBe('ws-1');
    expect(typeof context.resolvedAt).toBe('string');
    expect(context.confidence).toBe('high');
    expect(context.voice.tone).toBe('authoritative');
    expect(context.provenance.signalCount).toBe(1);
  });

  it('honestly degrades to identity: null and visualIdentity: null (no workspace-scoped source exists yet)', async () => {
    const workspace = makeWorkspaceDomain([makeLearning()]);
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity).toBeNull();
    expect(context.visualIdentity).toBeNull();
  });

  it('returns a low-confidence-but-complete context for a workspace with zero learnings, rather than throwing', async () => {
    const workspace = makeWorkspaceDomain([]);
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-empty');

    expect(context.confidence).toBe('degraded');
    expect(context.provenance.signalCount).toBe(0);
    expect(context.provenance.lastConsolidatedAt).toBeNull();
    expect(context.voice).toEqual({
      tone: 'professional',
      cadence: 'medium',
      audienceType: 'general',
      executiveLevel: false,
      domain: 'general',
      bannedPhrases: [],
    });
  });

  it('calls WorkspaceIntelligenceDomain.getWorkspaceLearnings with the given workspaceId, and nothing else', async () => {
    const workspace = makeWorkspaceDomain([]);
    const builder = new ContextBuilder(workspace);

    await builder.build('ws-42', 'blog_post');

    expect(workspace.getWorkspaceLearnings).toHaveBeenCalledWith('ws-42');
    expect(workspace.getWorkspaceLearnings).toHaveBeenCalledTimes(1);
  });
});
