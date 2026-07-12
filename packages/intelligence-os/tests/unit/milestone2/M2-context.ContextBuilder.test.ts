/**
 * M2-context.ContextBuilder.test.ts
 *
 * Milestone 2 (CognitionProvider integration layer), extended for ADR-003
 * (Subject-Centric Intelligence) — identity synthesis and explicit
 * voice-configuration precedence.
 */

import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from '../../../src/context/ContextBuilder';
import { COGNITION_CONTRACT_VERSION } from '@platform/cognition-contract';
import type { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { Learning, WorkspaceContext } from '../../../src/types/entities';

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1',
    userId: null,
    workspaceId: 'ws-1',
    subjectType: 'workspace',
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

function makeWorkspaceDomain(
  learnings: Learning[],
  contextOverrides: Partial<WorkspaceContext> = {},
): WorkspaceIntelligenceDomain {
  return {
    getWorkspaceLearnings: vi.fn().mockResolvedValue(learnings),
    getContext: vi.fn().mockResolvedValue({
      workspaceId: 'ws-1',
      complianceConstraints: [],
      voiceConfiguration: null,
      identityConfiguration: null,
      ...contextOverrides,
    }),
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

  it('honestly returns identity: null when no identity-relevant learnings exist yet, and visualIdentity: null unconditionally', async () => {
    const workspace = makeWorkspaceDomain([makeLearning()]); // only a writing_style (voice) learning
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity).toBeNull();
    expect(context.visualIdentity).toBeNull();
  });

  it('ADR-003: synthesizes identity from identity-relevant workspace learnings', async () => {
    const workspace = makeWorkspaceDomain([
      makeLearning({
        id: 'lrn-identity',
        taxonomyCategory: 'professional_identity',
        confidence: 0.8,
        content: { brandName: 'Acme', argumentationStyle: 'evidence-led', narrativeArcs: ['problem-solution'] },
      }),
      makeLearning({
        id: 'lrn-framework',
        taxonomyCategory: 'intellectual_frameworks',
        confidence: 0.7,
        content: { framework: 'Jobs to be Done' },
      }),
    ]);
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity).not.toBeNull();
    expect(context.identity?.brandName).toBe('Acme');
    expect(context.identity?.argumentationStyle).toBe('evidence-led');
    expect(context.identity?.narrativeArcs).toEqual(['problem-solution']);
    expect(context.identity?.namedFrameworks).toEqual(['Jobs to be Done']);
  });

  it('ADR-003: does not synthesize identity from below-confidence-threshold learnings', async () => {
    const workspace = makeWorkspaceDomain([
      makeLearning({
        taxonomyCategory: 'professional_identity',
        confidence: 0.2, // below the 0.5 identity-synthesis floor
        content: { brandName: 'Acme' },
      }),
    ]);
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity).toBeNull();
  });

  it('ADR-003: explicit voice configuration overrides Learning-derived voice fields it declares, and nothing else', async () => {
    const workspace = makeWorkspaceDomain(
      [makeLearning({ content: { tone: 'authoritative', domain: 'fintech' } })],
      { voiceConfiguration: { tone: 'playful', bannedPhrases: ['synergy'] } },
    );
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.voice.tone).toBe('playful'); // overridden by explicit configuration
    expect(context.voice.bannedPhrases).toEqual(['synergy']); // overridden
    expect(context.voice.domain).toBe('fintech'); // untouched — configuration didn't declare this field
  });

  it('D-3 closure: explicit identity configuration populates identity even with zero identity-relevant learnings', async () => {
    const workspace = makeWorkspaceDomain(
      [makeLearning()], // only a writing_style (voice) learning — no identity-relevant learnings
      { identityConfiguration: { brandName: 'ConfiguredCo', preferredLength: 'short' } },
    );
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity).not.toBeNull();
    expect(context.identity?.brandName).toBe('ConfiguredCo');
    expect(context.identity?.preferredLength).toBe('short');
  });

  it('D-3 closure: explicit identity configuration overrides Learning-derived identity fields it declares, and nothing else', async () => {
    const workspace = makeWorkspaceDomain(
      [
        makeLearning({
          taxonomyCategory: 'professional_identity',
          confidence: 0.8,
          content: { brandName: 'InferredCo', argumentationStyle: 'evidence-led' },
        }),
      ],
      { identityConfiguration: { brandName: 'ConfiguredCo' } },
    );
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity?.brandName).toBe('ConfiguredCo'); // overridden by explicit configuration
    expect(context.identity?.argumentationStyle).toBe('evidence-led'); // untouched — configuration didn't declare this field
  });

  it('D-3 closure: identity stays honestly null when neither learnings nor configuration contribute anything', async () => {
    const workspace = makeWorkspaceDomain([makeLearning()], { identityConfiguration: {} });
    const builder = new ContextBuilder(workspace);

    const context = await builder.build('ws-1');

    expect(context.identity).toBeNull();
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

  it('calls WorkspaceIntelligenceDomain.getWorkspaceLearnings and getContext with the given workspaceId, and nothing else', async () => {
    const workspace = makeWorkspaceDomain([]);
    const builder = new ContextBuilder(workspace);

    await builder.build('ws-42', 'blog_post');

    expect(workspace.getWorkspaceLearnings).toHaveBeenCalledWith('ws-42');
    expect(workspace.getWorkspaceLearnings).toHaveBeenCalledTimes(1);
    expect(workspace.getContext).toHaveBeenCalledWith('ws-42');
    expect(workspace.getContext).toHaveBeenCalledTimes(1);
  });
});
