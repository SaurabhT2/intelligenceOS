/**
 * E2-1.degradedConfidence.test.ts
 *
 * Epic 2 (Platform Publication) — E2-1-T1: ArtifactBlueprint gains
 * `degraded`, `confidenceScore`, and `buildDurationMs`.
 *
 * What this suite locks in:
 *   1. degraded === false on the full happy path (everything resolves).
 *   2. degraded === false for a brand-new user with NO stored intelligence
 *      at all — absence of data is normal, not degradation.
 *   3. degraded === true when any one of the five Step-1 sources throws
 *      (profile, archetype, project, workspace context, workspace learnings,
 *      audience profile) — one failure is enough to flip the flag.
 *   4. confidenceScore is always within [0, 1], is 0 when there is no
 *      profile and no audience confidence, and increases when a
 *      high-confidence profile is present.
 *   5. buildDurationMs is always a non-negative number, present on both
 *      the degraded and the happy path.
 *
 * Reuses the same mocked-domains harness shape as tests/integration/blueprint.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { BlueprintBuilder } from '../../../src/blueprint/BlueprintBuilder';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import type { IntelligenceProfile, AudienceProfile } from '../../../src/types/entities';
import type { ArtifactRequest } from '@intelligence-os/shared-types';

function createMockDomains() {
  return {
    user: {
      getCurrentProfile:         vi.fn().mockResolvedValue(null),
      getCurrentArchetype:       vi.fn().mockResolvedValue(null),
      getActiveLearnings:        vi.fn().mockResolvedValue([]),
      getGenericAudienceProfile: vi.fn().mockResolvedValue(null),
    },
    project: {
      getProject: vi.fn().mockResolvedValue(null),
    },
    artifact: {
      getPattern:        vi.fn().mockResolvedValue(null),
      persistBlueprint:  vi.fn().mockResolvedValue(undefined),
    },
    knowledge: {
      getAssets: vi.fn().mockResolvedValue([]),
    },
    workspace: {
      getContext:            vi.fn().mockResolvedValue(null),
      getWorkspaceLearnings: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeBuilder(domains = createMockDomains()) {
  const builder = new BlueprintBuilder(domains as any, new InProcessEventBus());
  return { builder, domains };
}

const NEW_USER_REQUEST: ArtifactRequest = {
  userId:       'brand-new-user',
  artifactType: 'linkedin_post',
};

const BOARD_REQUEST: ArtifactRequest = {
  userId:       'u1',
  artifactType: 'board_update',
  audienceRef:  { audienceType: 'board' },
};

const HIGH_CONFIDENCE_PROFILE: IntelligenceProfile = {
  id: 'prof-1', userId: 'u1', workspaceId: null, subjectType: 'user', version: 3, isCurrent: true,
  compositeConfidence: 0.9, archetypePrimary: 'founder', archetypeConfidence: 0.9,
  voiceSummary: null, goalSummary: null, constraintSummary: null,
  preferenceSummary: null, expertiseDomains: null, vocabularySnapshot: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const STORED_AUDIENCE_PROFILE: AudienceProfile = {
  id: 'aud-1', userId: 'u1', ownerType: 'generic', relationshipId: null,
  audienceType: 'board', expertiseLevel: 'practitioner',
  communicationNorms: {}, knownSensitivities: {}, confidence: 0.8,
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
};

describe('ArtifactBlueprint.degraded — happy paths are never degraded', () => {
  it('is false when every Step-1 fetch resolves normally', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.degraded).toBe(false);
  });

  it('is false for a brand-new user with zero stored intelligence (absence ≠ degradation)', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(NEW_USER_REQUEST);
    expect(blueprint.degraded).toBe(false);
  });

  it('is false when no projectId/workspaceId is provided (skip ≠ degradation)', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST); // no projectId, no workspaceId
    expect(blueprint.degraded).toBe(false);
  });
});

describe('ArtifactBlueprint.degraded — a single Step-1 failure flips the flag', () => {
  it('is true when getCurrentProfile() rejects', async () => {
    const domains = createMockDomains();
    domains.user.getCurrentProfile.mockRejectedValue(new Error('db down'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.degraded).toBe(true);
    // ...and the blueprint is still returned, never thrown.
    expect(blueprint).toBeDefined();
  });

  it('is true when getCurrentArchetype() rejects', async () => {
    const domains = createMockDomains();
    domains.user.getCurrentArchetype.mockRejectedValue(new Error('timeout'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.degraded).toBe(true);
  });

  it('is true when ProjectContextBuilder degrades (getProject rejects)', async () => {
    const domains = createMockDomains();
    domains.project.getProject.mockRejectedValue(new Error('connection reset'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build({ ...BOARD_REQUEST, projectId: 'proj-1' });
    expect(blueprint.degraded).toBe(true);
  });

  it('is true when ProjectContextBuilder degrades (getAssets rejects)', async () => {
    const domains = createMockDomains();
    domains.knowledge.getAssets.mockRejectedValue(new Error('Supabase 500'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.degraded).toBe(true);
  });

  it('is true when AudienceCalibrator degrades (getGenericAudienceProfile rejects)', async () => {
    const domains = createMockDomains();
    domains.user.getGenericAudienceProfile.mockRejectedValue(new Error('rate limited'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST); // has audienceRef.audienceType: 'board'
    expect(blueprint.degraded).toBe(true);
  });

  it('is true when workspace learnings fetch rejects', async () => {
    const domains = createMockDomains();
    domains.workspace.getWorkspaceLearnings.mockRejectedValue(new Error('Supabase timeout'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build({ ...BOARD_REQUEST, workspaceId: 'ws-1' });
    expect(blueprint.degraded).toBe(true);
  });

  it('is NOT true merely because getGenericAudienceProfile resolves to null (no stored profile, no error)', async () => {
    const domains = createMockDomains();
    domains.user.getGenericAudienceProfile.mockResolvedValue(null);
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.degraded).toBe(false);
  });
});

describe('ArtifactBlueprint.confidenceScore', () => {
  it('is always within [0, 1]', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(blueprint.confidenceScore).toBeLessThanOrEqual(1);
  });

  it('is low (near system-default audience confidence only) for a brand-new user', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(NEW_USER_REQUEST);
    // No profile (0 weight) + no audienceRef → DEFAULT_AUDIENCE_CALIBRATION confidence.
    // Whatever that default is, it must be small relative to a populated profile case.
    expect(blueprint.confidenceScore).toBeLessThan(0.3);
  });

  it('increases when a high-confidence stored profile and audience profile are present', async () => {
    const domains = createMockDomains();
    domains.user.getCurrentProfile.mockResolvedValue(HIGH_CONFIDENCE_PROFILE);
    domains.user.getGenericAudienceProfile.mockResolvedValue(STORED_AUDIENCE_PROFILE);
    const { builder } = makeBuilder(domains);

    const blueprintWithIntel = await builder.build(BOARD_REQUEST);

    const { builder: bareBuilder } = makeBuilder();
    const blueprintBare = await bareBuilder.build(BOARD_REQUEST);

    expect(blueprintWithIntel.confidenceScore).toBeGreaterThan(blueprintBare.confidenceScore);
    // 0.7 * 0.9 + 0.3 * 0.8 = 0.87
    expect(blueprintWithIntel.confidenceScore).toBeCloseTo(0.87, 5);
  });

  it('is not reduced by degradation — confidence and degraded answer different questions', async () => {
    const domains = createMockDomains();
    domains.user.getCurrentProfile.mockResolvedValue(HIGH_CONFIDENCE_PROFILE);
    domains.user.getGenericAudienceProfile.mockResolvedValue(STORED_AUDIENCE_PROFILE);
    // Force an unrelated Step-1 source to fail.
    domains.workspace.getWorkspaceLearnings.mockRejectedValue(new Error('boom'));
    const { builder } = makeBuilder(domains);

    const blueprint = await builder.build({ ...BOARD_REQUEST, workspaceId: 'ws-1' });

    expect(blueprint.degraded).toBe(true);
    expect(blueprint.confidenceScore).toBeCloseTo(0.87, 5);
  });
});

describe('ArtifactBlueprint.buildDurationMs', () => {
  it('is a non-negative number on the happy path', async () => {
    const { builder } = makeBuilder();
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(typeof blueprint.buildDurationMs).toBe('number');
    expect(blueprint.buildDurationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(blueprint.buildDurationMs)).toBe(true);
  });

  it('is a non-negative number even when the blueprint is degraded', async () => {
    const domains = createMockDomains();
    domains.user.getCurrentProfile.mockRejectedValue(new Error('db down'));
    const { builder } = makeBuilder(domains);
    const blueprint = await builder.build(BOARD_REQUEST);
    expect(blueprint.degraded).toBe(true);
    expect(blueprint.buildDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('matches the processingMs emitted on intelligence.blueprint.built', async () => {
    const domains = createMockDomains();
    const bus = new InProcessEventBus();
    let emittedProcessingMs: number | undefined;
    bus.on('intelligence.blueprint.built', async (payload) => {
      emittedProcessingMs = payload.processingMs;
    });
    const builder = new BlueprintBuilder(domains as any, bus);

    const blueprint = await builder.build(BOARD_REQUEST);

    expect(emittedProcessingMs).toBe(blueprint.buildDurationMs);
  });
});
