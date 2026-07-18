/**
 * ADR-004.ContextBuilder.knowledgeReasoningPositioning.test.ts
 *
 * ADR-004 (Cognitive Consolidation) §8, §9 — ContextBuilder performs zero
 * synthesis for these three fields; this file verifies the thin
 * projection specifically (contract-shape stripping of sourceId/
 * sourceKind/per-item confidence, null-profile handling, confidence
 * threshold projection), distinct from `M2-context.ContextBuilder.test.ts`
 * which covers `identity`/`voice` (unrelated to this ADR).
 */

import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from '../../../src/context/ContextBuilder';
import type { WorkspaceIntelligenceDomain } from '../../../src/domains/WorkspaceIntelligenceDomain';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { IntelligenceProfile } from '../../../src/types/entities';

function makeWorkspaceDomain(): WorkspaceIntelligenceDomain {
  return {
    getWorkspaceLearnings: vi.fn().mockResolvedValue([]),
    getContext: vi.fn().mockResolvedValue({
      workspaceId: 'ws-1', complianceConstraints: [], voiceConfiguration: null, identityConfiguration: null,
    }),
  } as unknown as WorkspaceIntelligenceDomain;
}

function makeUserDomain(profile: IntelligenceProfile | null): UserIntelligenceDomain {
  return { getCurrentProfileForSubject: vi.fn().mockResolvedValue(profile) } as unknown as UserIntelligenceDomain;
}

function makeProfile(overrides: Partial<IntelligenceProfile> = {}): IntelligenceProfile {
  return {
    id: 'prof-1', userId: null, workspaceId: 'ws-1', subjectType: 'workspace',
    version: 1, isCurrent: true, compositeConfidence: 0.8,
    archetypePrimary: null, archetypeConfidence: null,
    voiceSummary: null, goalSummary: null, constraintSummary: null, preferenceSummary: null,
    expertiseDomains: null, vocabularySnapshot: null,
    knowledgeSummary: null, reasoningSummary: null, positioningSummary: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

describe('ContextBuilder.build() — ADR-004 knowledge/reasoning/positioning', () => {
  it('resolves all three to null when no profile exists for the workspace yet', async () => {
    const builder = new ContextBuilder(makeWorkspaceDomain(), makeUserDomain(null));

    const context = await builder.build('ws-1');

    expect(context.knowledge).toBeNull();
    expect(context.reasoning).toBeNull();
    expect(context.positioning).toBeNull();
  });

  it('projects a populated knowledgeSummary into CognitionContext.knowledge, stripping internal provenance', async () => {
    const profile = makeProfile({
      knowledgeSummary: {
        items: [{ value: { name: 'JTBD', description: 'jobs to be done' }, confidence: 0.8, sourceKind: 'knowledge', sourceId: 'asset-1', sourceObservedAt: new Date().toISOString() }],
        confidence: 0.8,
        hasConflict: false,
      },
    });
    const builder = new ContextBuilder(makeWorkspaceDomain(), makeUserDomain(profile));

    const context = await builder.build('ws-1');

    expect(context.knowledge).toEqual({
      themes: [{ name: 'JTBD', description: 'jobs to be done' }],
      confidence: 'high',
      hasConflict: false,
    });
    // sourceId/sourceKind must not leak onto the contract-facing shape.
    expect(JSON.stringify(context.knowledge)).not.toContain('sourceId');
    expect(JSON.stringify(context.knowledge)).not.toContain('sourceKind');
  });

  it('projects reasoningSummary/positioningSummary independently — one populated, others null', async () => {
    const profile = makeProfile({
      reasoningSummary: {
        items: [{ value: { statement: 'evidence-led decisions' }, confidence: 0.4, sourceKind: 'experience', sourceId: 'lrn-1', sourceObservedAt: new Date().toISOString() }],
        confidence: 0.4,
        hasConflict: true,
      },
    });
    const builder = new ContextBuilder(makeWorkspaceDomain(), makeUserDomain(profile));

    const context = await builder.build('ws-1');

    expect(context.reasoning).toEqual({
      conclusions: [{ statement: 'evidence-led decisions' }],
      confidence: 'low',
      hasConflict: true,
    });
    expect(context.knowledge).toBeNull();
    expect(context.positioning).toBeNull();
  });

  it('projects the 0-1 confidence float using the same 0.75/0.5 thresholds voiceMapping.deriveConfidence() uses', async () => {
    const medium = makeProfile({
      positioningSummary: { items: [{ value: { statement: 'x' }, confidence: 0.6, sourceKind: 'experience', sourceId: 'l1', sourceObservedAt: new Date().toISOString() }], confidence: 0.6, hasConflict: false },
    });
    const builder = new ContextBuilder(makeWorkspaceDomain(), makeUserDomain(medium));

    const context = await builder.build('ws-1');

    expect(context.positioning!.confidence).toBe('medium');
  });

  it('performs the profile read alongside the two existing reads (one additional query, not N)', async () => {
    const workspaceDomain = makeWorkspaceDomain();
    const userDomain = makeUserDomain(null);
    const builder = new ContextBuilder(workspaceDomain, userDomain);

    await builder.build('ws-1');

    expect(workspaceDomain.getWorkspaceLearnings).toHaveBeenCalledTimes(1);
    expect(workspaceDomain.getContext).toHaveBeenCalledTimes(1);
    expect(userDomain.getCurrentProfileForSubject).toHaveBeenCalledTimes(1);
  });
});
