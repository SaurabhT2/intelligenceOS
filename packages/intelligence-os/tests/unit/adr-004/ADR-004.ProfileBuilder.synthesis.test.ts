/**
 * ADR-004.ProfileBuilder.synthesis.test.ts
 *
 * ADR-004 (Cognitive Consolidation) §7 — direct coverage of the
 * union-with-provenance combination rule, the tie-break order, the
 * `positioning` Experience-only scope decision (§0.1), and the corrected
 * `vocabularySnapshot` computation, all exercised through
 * `ProfileBuilder.rebuildForSubject()` (the only public entry point that
 * runs this logic — `buildDomainSummaries()` and its helpers are
 * module-private by design, ADR-004 §8's "zero synthesis in ContextBuilder"
 * principle applied symmetrically: all synthesis logic is private to this
 * one pipeline stage).
 */

import { describe, it, expect, vi } from 'vitest';
import { ProfileBuilder } from '../../../src/pipeline/ProfileBuilder';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import { workspaceSubject, userSubject } from '../../../src/types/subject';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';
import type { Learning, KnowledgeAsset } from '../../../src/types/entities';

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1', userId: null, workspaceId: 'ws-1', subjectType: 'workspace', projectId: null,
    domain: 'artifact_intelligence', taxonomyCategory: 'intellectual_frameworks',
    stabilityClass: 'medium_term', state: 'ACTIVE', confidence: 0.6,
    contextScope: 'global', contextArtifactType: null, contextProjectId: null,
    contextAudienceType: null, content: { name: 'JTBD', description: 'jobs to be done' },
    sourceSummary: {}, decayRate: 'standard', lastConfirmedAt: null, decayStartedAt: null,
    archivedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeKnowledgeAsset(overrides: Partial<KnowledgeAsset> = {}): KnowledgeAsset {
  return {
    id: 'asset-1', ownerType: 'workspace', userId: null, projectId: null, workspaceId: 'ws-1',
    assetType: 'reference', title: 'Strategy doc', sourceFileRef: null,
    extractedVocabulary: null, extractedPatterns: null, extractedFrameworks: null,
    extractedVisualFeatures: null, confidence: 0.9, version: 1, isCurrent: true,
    createdAt: new Date('2026-02-01T00:00:00Z'), updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDomains(learnings: Learning[], assets: KnowledgeAsset[]) {
  const userDomain = {
    getAllActiveLearningsForSubject: vi.fn().mockResolvedValue(learnings),
    getCurrentProfileForSubject: vi.fn().mockResolvedValue(null),
    upsertProfile: vi.fn().mockResolvedValue(undefined),
    markPreviousProfilesNonCurrentForSubject: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserIntelligenceDomain;

  const knowledgeDomain = {
    getCurrentAssetsForSubject: vi.fn().mockResolvedValue(assets),
  } as unknown as KnowledgeIntelligenceDomain;

  return { userDomain, knowledgeDomain };
}

describe('ProfileBuilder — ADR-004 §7.1 union-with-provenance', () => {
  it('combines items from both Knowledge and Experience into one collection', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'intellectual_frameworks', content: { name: 'Build-Measure-Learn', description: 'lean cycle' }, confidence: 0.7 })];
    const assets = [makeKnowledgeAsset({
      extractedFrameworks: { frameworks: [{ name: 'JTBD', description: 'jobs to be done', category: 'strategic', confidence: 0.6, evidence: [] }], frameworkCount: 1 },
    })];
    const { userDomain, knowledgeDomain } = makeDomains(learnings, assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary).not.toBeNull();
    const names = profile.knowledgeSummary!.items.map(i => i.value.name).sort();
    expect(names).toEqual(['Build-Measure-Learn', 'JTBD']);
  });

  it('deduplicates by normalized value, keeping the higher-confidence item', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'intellectual_frameworks', content: { name: 'jobs to be done', description: '' }, confidence: 0.3 })];
    const assets = [makeKnowledgeAsset({
      confidence: 0.9,
      extractedFrameworks: { frameworks: [{ name: 'Jobs To Be Done', description: 'the real one', category: 'strategic', confidence: 0.9, evidence: [] }], frameworkCount: 1 },
    })];
    const { userDomain, knowledgeDomain } = makeDomains(learnings, assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary!.items).toHaveLength(1);
    expect(profile.knowledgeSummary!.items[0]!.sourceKind).toBe('knowledge');
    expect(profile.knowledgeSummary!.items[0]!.value.description).toBe('the real one');
  });

  it('caps Knowledge-sourced item confidence at the uploaded_artifact ceiling even if the extractor reports higher', async () => {
    const assets = [makeKnowledgeAsset({
      extractedFrameworks: { frameworks: [{ name: 'Sky-high', description: '', category: 'strategic', confidence: 0.99, evidence: [] }], frameworkCount: 1 },
    })];
    const { userDomain, knowledgeDomain } = makeDomains([], assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary!.items[0]!.confidence).toBeLessThanOrEqual(0.75);
  });

  it('collection confidence is the max across items, not an average', async () => {
    const learnings = [
      makeLearning({ id: 'l1', taxonomyCategory: 'intellectual_frameworks', content: { name: 'Low', description: '' }, confidence: 0.2 }),
      makeLearning({ id: 'l2', taxonomyCategory: 'intellectual_frameworks', content: { name: 'High', description: '' }, confidence: 0.9 }),
    ];
    const { userDomain, knowledgeDomain } = makeDomains(learnings, []);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary!.confidence).toBe(0.9);
  });

  it('sets hasConflict when a contributing Learning is FLAGGED', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'intellectual_frameworks', state: 'FLAGGED' })];
    const { userDomain, knowledgeDomain } = makeDomains(learnings, []);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary!.hasConflict).toBe(true);
  });

  it('does not set hasConflict when no contributing Learning is FLAGGED', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'intellectual_frameworks', state: 'ACTIVE' })];
    const { userDomain, knowledgeDomain } = makeDomains(learnings, []);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary!.hasConflict).toBe(false);
  });

  it('a field with zero contributing items from either source resolves to null, not an empty collection', async () => {
    const { userDomain, knowledgeDomain } = makeDomains([], []);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary).toBeNull();
    expect(profile.reasoningSummary).toBeNull();
    expect(profile.positioningSummary).toBeNull();
  });

  // Completion Mission (RCA finding — knowledge summary generation): a
  // successfully-ingested, high-confidence document with real extracted
  // vocabulary but no *named framework* used to still resolve to a null
  // knowledgeSummary (surfacing as an unqualified `knowledge:NO` at
  // generation time, indistinguishable from "nothing was ingested at
  // all"). knowledgeSummary must now also read extractedVocabulary, the
  // same way it already reads extractedFrameworks.
  it('includes vocabulary-only Knowledge (no extracted frameworks) in knowledgeSummary', async () => {
    const assets = [makeKnowledgeAsset({
      extractedFrameworks: null,
      extractedVocabulary: {
        terms: [{ term: 'Ideal Customer Profile', frequency: 4 }],
        phrases: [],
        termCount: 1,
        phraseCount: 0,
      },
    })];
    const { userDomain, knowledgeDomain } = makeDomains([], assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.knowledgeSummary).not.toBeNull();
    expect(profile.knowledgeSummary!.items.map(i => i.value.name)).toContain('Ideal Customer Profile');
  });

  it('does not double-count a term that appears in both extractedVocabulary and an extractedFramework name', async () => {
    const assets = [makeKnowledgeAsset({
      extractedFrameworks: {
        frameworks: [{ name: 'JTBD', description: 'jobs to be done', category: 'strategic', confidence: 0.6, evidence: [] }],
        frameworkCount: 1,
      },
      extractedVocabulary: {
        terms: [{ term: 'JTBD', frequency: 3 }],
        phrases: [],
        termCount: 1,
        phraseCount: 0,
      },
    })];
    const { userDomain, knowledgeDomain } = makeDomains([], assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    const jtbdItems = profile.knowledgeSummary!.items.filter(i => i.value.name === 'JTBD');
    expect(jtbdItems).toHaveLength(1);
  });
});

describe('ProfileBuilder — ADR-004 §0.1 positioning is Experience-only', () => {
  it('positioningSummary never contains a Knowledge-sourced item, even when extractedFrameworks/Patterns are populated', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'competitive_intelligence', content: { statement: 'premium positioning' }, confidence: 0.7 })];
    const assets = [makeKnowledgeAsset({
      extractedFrameworks: { frameworks: [{ name: 'Some Framework', description: '', category: 'strategic', confidence: 0.9, evidence: [] }], frameworkCount: 1 },
      extractedPatterns: { patterns: [{ pattern: 'premium positioning', patternType: 'narrative', frequency: 3, confidence: 0.9 }], patternCount: 1 },
    })];
    const { userDomain, knowledgeDomain } = makeDomains(learnings, assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.positioningSummary).not.toBeNull();
    expect(profile.positioningSummary!.items).toHaveLength(1);
    expect(profile.positioningSummary!.items[0]!.sourceKind).toBe('experience');
  });
});

describe('ProfileBuilder — ADR-004 §5 reasoning reads only analytical/evaluative frameworks', () => {
  it('excludes a Knowledge framework categorized outside analytical/evaluative', async () => {
    const assets = [makeKnowledgeAsset({
      extractedFrameworks: {
        frameworks: [
          { name: 'Methodological Thing', description: '', category: 'methodological', confidence: 0.8, evidence: [] },
          { name: 'Analytical Thing', description: '', category: 'analytical', confidence: 0.8, evidence: [] },
        ],
        frameworkCount: 2,
      },
    })];
    const { userDomain, knowledgeDomain } = makeDomains([], assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.reasoningSummary!.items.map(i => i.value.statement).join(' ')).toContain('Analytical Thing');
    expect(profile.reasoningSummary!.items).toHaveLength(1);
    // The same framework is still eligible for knowledgeSummary regardless of category.
    expect(profile.knowledgeSummary!.items.map(i => i.value.name)).toContain('Methodological Thing');
  });
});

describe('ProfileBuilder — ADR-004 §5 corrected vocabularySnapshot reads Knowledge too', () => {
  it('includes a term from KnowledgeAsset.extractedVocabulary, not only Learning-sourced vocabulary', async () => {
    const assets = [makeKnowledgeAsset({
      extractedVocabulary: { terms: [{ term: 'burn rate', surfaceForm: 'burn rate', frequency: 3, isAcronym: false, isProprietary: false }], phrases: [], termCount: 1 },
    })];
    const { userDomain, knowledgeDomain } = makeDomains([], assets);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect(profile.vocabularySnapshot).not.toBeNull();
    expect(Object.keys(profile.vocabularySnapshot!)).toContain('burn rate');
  });
});

describe('ProfileBuilder — ADR-004 §12.2 shouldRebuildForSubjectFromKnowledge', () => {
  it('triggers when no profile exists yet', async () => {
    const { userDomain, knowledgeDomain } = makeDomains([], []);
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('u1'), 'asset-1');

    expect(decision.shouldRebuild).toBe(true);
  });

  it('debounces a second Knowledge-triggered rebuild within the debounce window', async () => {
    const userDomain = {
      getCurrentProfileForSubject: vi.fn().mockResolvedValue({
        version: 1, updatedAt: new Date(), // "just rebuilt"
      }),
    } as unknown as UserIntelligenceDomain;
    const knowledgeDomain = {} as unknown as KnowledgeIntelligenceDomain;
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('u1'), 'asset-1');

    expect(decision.shouldRebuild).toBe(false);
    expect(decision.reason).toContain('Debounced');
  });

  it('triggers again once the debounce window has elapsed', async () => {
    const userDomain = {
      getCurrentProfileForSubject: vi.fn().mockResolvedValue({
        version: 1, updatedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
      }),
    } as unknown as UserIntelligenceDomain;
    const knowledgeDomain = {} as unknown as KnowledgeIntelligenceDomain;
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('u1'), 'asset-1');

    expect(decision.shouldRebuild).toBe(true);
  });
});
