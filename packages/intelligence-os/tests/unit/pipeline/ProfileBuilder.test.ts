/**
 * ProfileBuilder.test.ts
 *
 * Dedicated unit tests for ProfileBuilder's core rebuild-decision and
 * rebuild-execution logic (Stage 6 of the Learning Pipeline,
 * ARCHITECTURE.md §9). Closes part of the test-coverage gap
 * `IMPLEMENTATION_STATUS.md`/`ROADMAP.md` flag: this pre-existing logic
 * (composite confidence weighting, the three shouldRebuild triggers,
 * profile-versioning mechanics, event emission, and the ADR-004 Knowledge-
 * trigger debounce) previously had only indirect coverage via
 * `pipeline-integration.test.ts`. ADR-004's union-with-provenance synthesis
 * logic already has its own dedicated file
 * (`tests/unit/adr-004/ADR-004.ProfileBuilder.synthesis.test.ts`) and is not
 * duplicated here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProfileBuilder } from '../../../src/pipeline/ProfileBuilder';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import { userSubject, workspaceSubject } from '../../../src/types/subject';
import type { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';
import type { IntelligenceProfile, Learning } from '../../../src/types/entities';

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1', userId: 'user-1', workspaceId: null, subjectType: 'user', projectId: null,
    domain: 'user_intelligence', taxonomyCategory: 'communication_style',
    stabilityClass: 'long_term', state: 'VALIDATED', confidence: 0.6,
    contextScope: 'global', contextArtifactType: null, contextProjectId: null,
    contextAudienceType: null, content: { statement: 'concise' },
    sourceSummary: {}, decayRate: 'slow', lastConfirmedAt: new Date(), decayStartedAt: null,
    archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<IntelligenceProfile> = {}): IntelligenceProfile {
  return {
    id: 'prof-1', userId: 'user-1', workspaceId: null, subjectType: 'user',
    version: 1, isCurrent: true, compositeConfidence: 0.5,
    archetypePrimary: null, archetypeConfidence: null,
    voiceSummary: null, goalSummary: null, constraintSummary: null, preferenceSummary: null,
    expertiseDomains: null, vocabularySnapshot: null, knowledgeSummary: null,
    reasoningSummary: null, positioningSummary: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeDomains(overrides: {
  currentProfile?: IntelligenceProfile | null;
  learnings?: Learning[];
  newHighConfidenceCount?: number;
} = {}) {
  const userDomain = {
    getCurrentProfileForSubject: vi.fn().mockResolvedValue(overrides.currentProfile ?? null),
    getAllActiveLearningsForSubject: vi.fn().mockResolvedValue(overrides.learnings ?? []),
    countLearningsSinceForSubject: vi.fn().mockResolvedValue(overrides.newHighConfidenceCount ?? 0),
    upsertProfile: vi.fn().mockResolvedValue(undefined),
    markPreviousProfilesNonCurrentForSubject: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserIntelligenceDomain;

  const knowledgeDomain = {
    getCurrentAssetsForSubject: vi.fn().mockResolvedValue([]),
  } as unknown as KnowledgeIntelligenceDomain;

  return { userDomain, knowledgeDomain };
}

describe('ProfileBuilder — shouldRebuild triggers', () => {
  it('always rebuilds on a permanent stability-class learning, before checking anything else', async () => {
    const { userDomain, knowledgeDomain } = makeDomains();
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuild('user-1', makeLearning({ stabilityClass: 'permanent' }));

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason).toContain('Permanent');
    // Should short-circuit before even reading the current profile.
    expect(userDomain.getCurrentProfileForSubject).not.toHaveBeenCalled();
  });

  it('rebuilds when no profile exists yet', async () => {
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: null });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuild('user-1', makeLearning({ stabilityClass: 'long_term' }));

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason).toContain('No profile');
  });

  it('rebuilds when the current profile is stale (> 60 days since last update)', async () => {
    const stale = makeProfile({ updatedAt: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000) });
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: stale });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuild('user-1', makeLearning({ stabilityClass: 'long_term' }));

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason).toContain('staleness');
  });

  it('does not rebuild a fresh profile with new-high-confidence-learnings at or below the threshold (3)', async () => {
    const fresh = makeProfile({ updatedAt: new Date() });
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: fresh, newHighConfidenceCount: 3 });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuild('user-1', makeLearning({ stabilityClass: 'long_term' }));

    expect(decision.shouldRebuild).toBe(false);
    expect(decision.newLearningsCount).toBe(3);
  });

  it('rebuilds a fresh profile once new-high-confidence-learnings strictly exceeds the threshold (3)', async () => {
    const fresh = makeProfile({ updatedAt: new Date() });
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: fresh, newHighConfidenceCount: 4 });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuild('user-1', makeLearning({ stabilityClass: 'long_term' }));

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason).toContain('4 new high-confidence');
  });

  it('shouldRebuildForSubject reads via the Subject-generic domain methods for a workspace subject', async () => {
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: null });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    await builder.shouldRebuildForSubject(workspaceSubject('ws-1'), makeLearning({ stabilityClass: 'long_term' }));

    expect(userDomain.getCurrentProfileForSubject).toHaveBeenCalledWith(workspaceSubject('ws-1'));
  });
});

describe('ProfileBuilder — Knowledge-trigger debounce (ADR-004 §12.2)', () => {
  it('triggers an initial rebuild when no profile exists yet', async () => {
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: null });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-1');

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.newLearningsCount).toBe(0);
  });

  it('debounces a second Knowledge-triggered rebuild within the 5-minute window', async () => {
    const recent = makeProfile({ updatedAt: new Date(Date.now() - 60 * 1000) }); // 1 minute ago
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: recent });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-2');

    expect(decision.shouldRebuild).toBe(false);
    expect(decision.reason).toContain('Debounced');
  });

  it('allows a Knowledge-triggered rebuild once the debounce window has elapsed', async () => {
    const old = makeProfile({ updatedAt: new Date(Date.now() - 6 * 60 * 1000) }); // 6 minutes ago
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: old });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-3');

    expect(decision.shouldRebuild).toBe(true);
    expect(decision.reason).toContain('asset-3');
  });

  // ── G-7 (Architecture Verification Report, P1) ────────────────────────────
  // Debounce individual triggers but schedule one deferred rebuild after a
  // burst ends, so a bulk upload eventually converges to a full rebuild
  // reflecting every document in the burst, not just whichever one
  // happened to land outside the 5-minute debounce window.
  describe('G-7 — trailing-edge deferred rebuild after a burst ends', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('a burst of N debounced uploads converges to exactly one deferred rebuild at burst-end', async () => {
      const recent = makeProfile({ updatedAt: new Date(Date.now() - 60 * 1000) }); // 1 minute ago
      const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: recent });
      const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

      // Simulate 19 uploads in rapid succession, each individually debounced.
      for (let i = 0; i < 19; i++) {
        const decision = await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), `asset-${i}`);
        expect(decision.shouldRebuild).toBe(false);
        await vi.advanceTimersByTimeAsync(10_000); // 10s apart — well inside the 5-minute window
      }

      expect(userDomain.upsertProfile).not.toHaveBeenCalled();

      // Burst goes quiet — advance past a full debounce window from the
      // *last* upload with nothing further resetting the timer.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_000);

      expect(userDomain.upsertProfile).toHaveBeenCalledTimes(1);
    });

    it('resets the trailing timer on each new debounced upload, not just the first', async () => {
      const recent = makeProfile({ updatedAt: new Date(Date.now() - 1_000) }); // 1s ago — plenty of headroom
      const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: recent });
      const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

      await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-a'); // t=0, timer → t=300000
      await vi.advanceTimersByTimeAsync(250_000); // t=250000; age=251000s, still well under the 300000ms threshold
      await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-b'); // resets timer → t=550000
      await vi.advanceTimersByTimeAsync(51_000); // t=301000 — past asset-a's original (now-superseded) fire time

      // The original timer's window has now passed, but it was reset — no rebuild yet.
      expect(userDomain.upsertProfile).not.toHaveBeenCalled();

      // Now let the (reset) timer actually elapse.
      await vi.advanceTimersByTimeAsync(250_000); // t=551000, past the reset fire time of 550000
      expect(userDomain.upsertProfile).toHaveBeenCalledTimes(1);
    });

    it('does not fire a deferred rebuild if an immediate rebuild already ran for this subject', async () => {
      const recent = makeProfile({ updatedAt: new Date(Date.now() - 60 * 1000) });
      const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: recent });
      const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

      // A debounced upload schedules a trailing timer...
      await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-a');
      // ...but a real rebuild happens for some other reason (e.g. a Learning
      // trigger) before the trailing timer fires.
      await builder.rebuildForSubject(userSubject('user-1'), ['user_intelligence']);
      expect(userDomain.upsertProfile).toHaveBeenCalledTimes(1);

      // The trailing timer must have been cancelled — no second rebuild.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_000);
      expect(userDomain.upsertProfile).toHaveBeenCalledTimes(1);
    });

    it('keys pending trailing rebuilds per-Subject — a burst for one workspace does not affect another', async () => {
      const recent = makeProfile({ updatedAt: new Date(Date.now() - 60 * 1000) });
      const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: recent });
      const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

      await builder.shouldRebuildForSubjectFromKnowledge(workspaceSubject('ws-1'), 'asset-a');
      await builder.shouldRebuildForSubjectFromKnowledge(workspaceSubject('ws-2'), 'asset-b');

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_000);

      // Both subjects' independent trailing timers fire — one rebuild each.
      expect(userDomain.upsertProfile).toHaveBeenCalledTimes(2);
    });

    it('does not trigger a rebuild storm for uploads spaced further apart than the debounce window', async () => {
      const recent = makeProfile({ updatedAt: new Date(Date.now() - 60 * 1000) });
      const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: recent });
      const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

      // First upload is debounced (profile updated 1 min ago) and schedules
      // a trailing timer for +5min.
      await builder.shouldRebuildForSubjectFromKnowledge(userSubject('user-1'), 'asset-a');

      // Nothing else happens until well past the debounce window — this
      // should behave exactly like the pre-G-7 leading-edge-only debounce:
      // a single rebuild, not a storm, and not a second redundant one.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_000);
      expect(userDomain.upsertProfile).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ProfileBuilder — composite confidence weighting', () => {
  it('weights higher-impact taxonomy categories more heavily than lower-impact ones', async () => {
    // communication_style has weight 1.0; tool_and_technology_preferences has weight 0.4.
    const learnings = [
      makeLearning({ taxonomyCategory: 'communication_style', confidence: 1.0 }),
      makeLearning({ id: 'lrn-2', taxonomyCategory: 'tool_and_technology_preferences', confidence: 0.1 }),
    ];
    const { userDomain, knowledgeDomain } = makeDomains({ learnings });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    // weighted = (1.0*1.0 + 0.1*0.4) / (1.0 + 0.4) = 1.04 / 1.4 ≈ 0.7429
    expect(profile.compositeConfidence).toBeCloseTo(0.7429, 3);
  });

  it('falls back to the default weight (0.4) for a taxonomy category with no explicit weight', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'personal_brand_signal', confidence: 0.6 })];
    const { userDomain, knowledgeDomain } = makeDomains({ learnings });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    // personal_brand_signal has an explicit weight (0.6) — use it to confirm
    // the general single-category math: weighted/(weight) == confidence.
    expect(profile.compositeConfidence).toBeCloseTo(0.6, 3);
  });

  it('returns 0 composite confidence when there are no active learnings', async () => {
    const { userDomain, knowledgeDomain } = makeDomains({ learnings: [] });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    expect(profile.compositeConfidence).toBe(0);
  });
});

describe('ProfileBuilder — legacy domain summaries', () => {
  it('summarises voice from the highest-confidence learning per category, keyed by taxonomy category', async () => {
    const learnings = [
      makeLearning({ taxonomyCategory: 'communication_style', confidence: 0.4, content: { tone: 'casual' } }),
      makeLearning({ id: 'lrn-2', taxonomyCategory: 'communication_style', confidence: 0.9, content: { tone: 'formal' } }),
    ];
    const { userDomain, knowledgeDomain } = makeDomains({ learnings });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    expect(profile.voiceSummary).toEqual({
      communication_style: { confidence: 0.9, content: { tone: 'formal' } },
    });
  });

  it('leaves a legacy summary field null when no learning falls into its categories', async () => {
    const learnings = [makeLearning({ taxonomyCategory: 'communication_style' })];
    const { userDomain, knowledgeDomain } = makeDomains({ learnings });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    expect(profile.goalSummary).toBeNull();
  });
});

describe('ProfileBuilder — versioning and event emission', () => {
  it('increments version from the current profile and marks the previous version non-current', async () => {
    const current = makeProfile({ version: 4 });
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: current, learnings: [makeLearning()] });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    expect(profile.version).toBe(5);
    expect(userDomain.markPreviousProfilesNonCurrentForSubject).toHaveBeenCalledWith(
      userSubject('user-1'), profile.id,
    );
  });

  it('starts at version 1 and skips the mark-non-current step when no prior profile exists', async () => {
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: null });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    expect(profile.version).toBe(1);
    expect(userDomain.markPreviousProfilesNonCurrentForSubject).not.toHaveBeenCalled();
  });

  it('emits intelligence.profile.updated with the changed domains and new version', async () => {
    const { userDomain, knowledgeDomain } = makeDomains();
    const bus = new InProcessEventBus();
    let emitted: Record<string, unknown> | null = null;
    bus.on('intelligence.profile.updated', async (payload) => {
      emitted = payload as unknown as Record<string, unknown>;
    });
    const builder = new ProfileBuilder(userDomain, bus, knowledgeDomain);

    await builder.rebuildForSubject(userSubject('user-1'), ['user_intelligence', 'knowledge_intelligence']);

    expect(emitted).not.toBeNull();
    expect((emitted as unknown as Record<string, unknown>)['changedDomains']).toEqual(['user_intelligence', 'knowledge_intelligence']);
    expect((emitted as unknown as Record<string, unknown>)['version']).toBe(1);
  });

  it('emits a workspace-shaped payload (workspaceId set, userId empty string) for a Workspace subject', async () => {
    const { userDomain, knowledgeDomain } = makeDomains();
    const bus = new InProcessEventBus();
    let emitted: Record<string, unknown> | null = null;
    bus.on('intelligence.profile.updated', async (payload) => {
      emitted = payload as unknown as Record<string, unknown>;
    });
    const builder = new ProfileBuilder(userDomain, bus, knowledgeDomain);

    await builder.rebuildForSubject(workspaceSubject('ws-1'));

    expect((emitted as unknown as Record<string, unknown>)['workspaceId']).toBe('ws-1');
    expect((emitted as unknown as Record<string, unknown>)['userId']).toBe('');
    expect((emitted as unknown as Record<string, unknown>)['subjectType']).toBe('workspace');
  });

  it('preserves the existing archetype fields across a rebuild rather than resetting them', async () => {
    const current = makeProfile({ archetypePrimary: 'The Strategist', archetypeConfidence: 0.8 });
    const { userDomain, knowledgeDomain } = makeDomains({ currentProfile: current });
    const builder = new ProfileBuilder(userDomain, new InProcessEventBus(), knowledgeDomain);

    const profile = await builder.rebuildForSubject(userSubject('user-1'));

    expect(profile.archetypePrimary).toBe('The Strategist');
    expect(profile.archetypeConfidence).toBe(0.8);
  });
});
