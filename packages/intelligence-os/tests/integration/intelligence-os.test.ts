/**
 * intelligence-os.test.ts
 *
 * Sprint 0 integration harness.
 *
 * Tests:
 *   1. IntelligenceOS can be instantiated
 *   2. InProcessEventBus publish/subscribe works correctly
 *   3. buildBlueprint() resolves; ingestKnowledgeAsset() resolves with asset id (Sprint 3)
 *   4. RelationshipIntelligenceDomain methods throw DomainNotActivatedError
 *   5. recordFeedbackEvent() writes to DB and emits the correct event
 *   6. upsertProject() writes to DB and emits the correct event
 *   7. UserIntelligenceDomain.getCurrentProfile() calls Supabase correctly
 *   8. ArtifactIntelligenceDomain.getPattern() applies Scope Rule correctly
 *
 * All Supabase interactions are mocked — no live database connection needed.
 * Source: Architecture Section 9, Sprint 0 task "Write integration harness".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntelligenceOS } from '../../src/IntelligenceOS';
import { InProcessEventBus } from '../../src/events/IntelligenceEventBus';
import {
  PhaseNotImplementedError,
  DomainNotActivatedError,
  DatabaseError,
} from '../../src/errors';
import type { IntelligenceEventPayload } from '../../src/types/events';

// ── Supabase mock factory ─────────────────────────────────────────────────────

/**
 * Creates a minimal Supabase client mock that returns configurable results
 * from maybeSingle(), single(), and the plain data query.
 *
 * The mock chains: schema(x).from(y).select(z).eq(...).maybeSingle()
 * All intermediate calls return `this` so the chain compiles.
 */
function createMockSupabase(overrides: {
  maybeSingleResult?: { data: unknown; error: null | { message: string } };
  singleResult?: { data: unknown; error: null | { message: string } };
  listResult?: { data: unknown[]; error: null | { message: string } };
} = {}) {
  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      overrides.maybeSingleResult ?? { data: null, error: null },
    ),
    single:      vi.fn().mockResolvedValue(
      overrides.singleResult ?? { data: { id: 'mock-uuid' }, error: null },
    ),
    // resolves when awaited directly (list queries without .maybeSingle)
    then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        resolve(overrides.listResult ?? { data: [], error: null }),
      ),
    ),
  };

  const fromMock = vi.fn().mockReturnValue(chain);
  const schemaMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    schema: schemaMock,
    _chain: chain,
    _from: fromMock,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIntelligence(supabase = createMockSupabase(), bus?: InProcessEventBus) {
  const eventBus = bus ?? new InProcessEventBus();
  const instance = new IntelligenceOS({
    supabase: supabase as unknown as import('@supabase/supabase-js').SupabaseClient,
    eventBus,
  });
  return { instance, eventBus, supabase };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('IntelligenceOS — instantiation', () => {
  it('constructs without throwing', () => {
    expect(() => makeIntelligence()).not.toThrow();
  });

  it('exposes all 6 domain stores', () => {
    const { instance } = makeIntelligence();
    expect(instance.domains.user).toBeDefined();
    expect(instance.domains.project).toBeDefined();
    expect(instance.domains.artifact).toBeDefined();
    expect(instance.domains.knowledge).toBeDefined();
    expect(instance.domains.relationship).toBeDefined();
    expect(instance.domains.workspace).toBeDefined();
  });

  it('exposes the event bus via .eventBus getter', () => {
    const bus = new InProcessEventBus();
    const { instance } = makeIntelligence(createMockSupabase(), bus);
    expect(instance.eventBus).toBe(bus);
  });

  it('creates an InProcessEventBus when none is provided', () => {
    const { instance } = makeIntelligence();
    expect(instance.eventBus).toBeInstanceOf(InProcessEventBus);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('InProcessEventBus', () => {
  let bus: InProcessEventBus;
  beforeEach(() => { bus = new InProcessEventBus(); });

  it('calls registered handler when event is emitted', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.profile.updated', handler);

    const payload: IntelligenceEventPayload<'intelligence.profile.updated'> = {
      userId: 'u1', profileId: 'p1', version: 2,
      changedDomains: ['user_intelligence'], compositeConfidence: 0.7,
      occurredAt: new Date().toISOString(),
    };
    await bus.emit('intelligence.profile.updated', payload);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('calls multiple handlers for the same event', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.artifact.feedback', h1);
    bus.on('intelligence.artifact.feedback', h2);
    await bus.emit('intelligence.artifact.feedback', {
      userId: 'u1', artifactId: 'a1', artifactType: 'board_update',
      eventType: 'accepted', occurredAt: new Date().toISOString(),
    });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('does not throw when a handler rejects (fire-and-forget)', async () => {
    bus.on('intelligence.project.created', vi.fn().mockRejectedValue(new Error('handler crash')));
    await expect(
      bus.emit('intelligence.project.created', {
        userId: 'u1', projectId: 'proj1', name: 'Test', lifecycleState: 'IDEATION',
        occurredAt: new Date().toISOString(), brandosProjectId: null, projectType: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not call handlers for different event types', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.conflict.recurring', handler);
    await bus.emit('intelligence.blueprint.built', {
      userId: 'u1', entityId: 'b1', entityType: 'blueprint',
      occurredAt: new Date().toISOString(), processingMs: 42, artifactType: 'board_update',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports handler count correctly', () => {
    bus.on('intelligence.user.correction', vi.fn().mockResolvedValue(undefined));
    bus.on('intelligence.user.correction', vi.fn().mockResolvedValue(undefined));
    expect(bus.handlerCount('intelligence.user.correction')).toBe(2);
    expect(bus.handlerCount('intelligence.artifact.feedback')).toBe(0);
  });

  it('reset() clears all handlers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.artifact.feedback', handler);
    bus.reset();
    await bus.emit('intelligence.artifact.feedback', {
      userId: 'u1', artifactId: 'a1', artifactType: 'board_update',
      eventType: 'accepted', occurredAt: new Date().toISOString(),
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Sprint 0 deferred methods', () => {
  it('buildBlueprint() resolves to an ArtifactBlueprint (Sprint 1 — no longer deferred)', async () => {
    // Sprint 0 stub threw PhaseNotImplementedError. Sprint 1 ships blueprint assembly.
    // This test is updated to reflect the new reality: buildBlueprint returns a blueprint.
    // Full blueprint assembly coverage is in tests/integration/blueprint.test.ts.
    const { instance } = makeIntelligence();
    const blueprint = await instance.buildBlueprint({ userId: 'u1', artifactType: 'board_update' });
    expect(blueprint).toBeDefined();
    expect(blueprint.userId).toBe('u1');
    expect(blueprint.artifactType).toBe('board_update');
  });

  it('ingestKnowledgeAsset() resolves with an asset id (Sprint 3 — no longer deferred)', async () => {
    const { instance } = makeIntelligence();
    const assetId = await instance.ingestKnowledgeAsset({
      ownerType: 'user', userId: 'u1',
      assetType: 'playbook', title: 'Test Asset',
    });
    // Sprint 3 activates this method — it must return a UUID string
    expect(typeof assetId).toBe('string');
    expect(assetId.length).toBeGreaterThan(0);
  });

  it('RelationshipIntelligenceDomain.getRelationship() throws DomainNotActivatedError', async () => {
    const { instance } = makeIntelligence();
    await expect(
      instance.domains.relationship.getRelationship('rel-id'),
    ).rejects.toThrow(DomainNotActivatedError);
  });

  it('RelationshipIntelligenceDomain.getNamedAudienceProfile() throws DomainNotActivatedError', async () => {
    const { instance } = makeIntelligence();
    await expect(
      instance.domains.relationship.getNamedAudienceProfile('rel-id'),
    ).rejects.toThrow(DomainNotActivatedError);
  });

  it('WorkspaceIntelligenceDomain.enforceComplianceConstraints() throws PhaseNotImplementedError', async () => {
    const { instance } = makeIntelligence();
    await expect(
      instance.domains.workspace.enforceComplianceConstraints('ws-1', ['proj-1']),
    ).rejects.toThrow(PhaseNotImplementedError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('recordFeedbackEvent()', () => {
  it('writes to feedback_events and emits intelligence.artifact.feedback', async () => {
    const db = createMockSupabase({
      singleResult: {
        data: {
          id: 'fe-uuid', user_id: 'u1', artifact_id: 'a1',
          artifact_type: 'board_update', project_id: null,
          event_type: 'accepted', edit_diff: null, explicit_reason: null,
          signals_extracted: false, blueprint_ref: null,
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    });
    const bus = new InProcessEventBus();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.artifact.feedback', handler);

    const { instance } = makeIntelligence(db, bus);
    await instance.recordFeedbackEvent({
      userId: 'u1', artifactId: 'a1',
      artifactType: 'board_update', eventType: 'accepted',
    });

    expect(db._chain.insert).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    const emittedPayload = handler.mock.calls[0]?.[0] as { userId: string; artifactId: string };
    expect(emittedPayload.userId).toBe('u1');
    expect(emittedPayload.artifactId).toBe('a1');
  });

  it('throws DatabaseError when Supabase insert fails', async () => {
    const db = createMockSupabase({
      singleResult: { data: null, error: { message: 'DB write failed' } },
    });
    const { instance } = makeIntelligence(db);
    await expect(
      instance.recordFeedbackEvent({
        userId: 'u1', artifactId: 'a1',
        artifactType: 'board_update', eventType: 'accepted',
      }),
    ).rejects.toThrow(DatabaseError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('upsertProject()', () => {
  it('upserts project and emits intelligence.project.created', async () => {
    const db = createMockSupabase({
      singleResult: { data: { id: 'proj-uuid' }, error: null },
    });
    const bus = new InProcessEventBus();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.on('intelligence.project.created', handler);

    const { instance } = makeIntelligence(db, bus);
    const id = await instance.upsertProject({
      userId: 'u1', name: 'Q3 Product Launch', lifecycleState: 'ACTIVE',
    });

    expect(id).toBe('proj-uuid');
    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0]?.[0] as { projectId: string; name: string };
    expect(payload.projectId).toBe('proj-uuid');
    expect(payload.name).toBe('Q3 Product Launch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('UserIntelligenceDomain.getCurrentProfile()', () => {
  it('returns null when no current profile exists', async () => {
    const db = createMockSupabase({ maybeSingleResult: { data: null, error: null } });
    const { instance } = makeIntelligence(db);
    const profile = await instance.domains.user.getCurrentProfile('u1');
    expect(profile).toBeNull();
    expect(db._chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(db._chain.eq).toHaveBeenCalledWith('is_current', true);
  });

  it('maps a profile row to IntelligenceProfile shape', async () => {
    const now = new Date().toISOString();
    const db = createMockSupabase({
      maybeSingleResult: {
        data: {
          id: 'prof-1', user_id: 'u1', version: 3, is_current: true,
          composite_confidence: 0.72, archetype_primary: 'founder',
          archetype_confidence: 0.85, voice_summary: null, goal_summary: null,
          constraint_summary: null, preference_summary: null,
          expertise_domains: null, vocabulary_snapshot: null,
          created_at: now, updated_at: now,
        },
        error: null,
      },
    });
    const { instance } = makeIntelligence(db);
    const profile = await instance.domains.user.getCurrentProfile('u1');
    expect(profile).not.toBeNull();
    expect(profile!.id).toBe('prof-1');
    expect(profile!.userId).toBe('u1');
    expect(profile!.version).toBe(3);
    expect(profile!.archetypePrimary).toBe('founder');
    expect(profile!.compositeConfidence).toBe(0.72);
    expect(profile!.createdAt).toBeInstanceOf(Date);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const db = createMockSupabase({
      maybeSingleResult: { data: null, error: { message: 'connection refused' } },
    });
    const { instance } = makeIntelligence(db);
    await expect(instance.domains.user.getCurrentProfile('u1')).rejects.toThrow(DatabaseError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ArtifactIntelligenceDomain.getPattern() — Scope Rule', () => {
  it('returns null when no patterns exist for the artifact type', async () => {
    const db = createMockSupabase({ listResult: { data: [], error: null } });
    const { instance } = makeIntelligence(db);
    const pattern = await instance.domains.artifact.getPattern('unknown_type');
    expect(pattern).toBeNull();
  });

  it('returns user-calibrated pattern over universal when userId provided', async () => {
    const now = new Date().toISOString();
    const universal = {
      id: 'pat-universal', artifact_type: 'board_update', pattern_level: 'universal',
      user_id: null, archetype_type: null, confidence: 0.5,
      sections: {}, narrative_model: {}, length_baseline: null, tone_model: null,
      exemplar_count: 5, known_rejection_triggers: [], created_at: now, updated_at: now,
    };
    const userCalibrated = {
      ...universal, id: 'pat-user', pattern_level: 'user_calibrated',
      user_id: 'u1', confidence: 0.8, exemplar_count: 2,
    };

    const db = createMockSupabase({ listResult: { data: [universal, userCalibrated], error: null } });
    const { instance } = makeIntelligence(db);

    const pattern = await instance.domains.artifact.getPattern('board_update', 'u1');
    expect(pattern!.id).toBe('pat-user');
    expect(pattern!.patternLevel).toBe('user_calibrated');
  });

  it('falls back to universal when no user-calibrated or archetype pattern exists', async () => {
    const now = new Date().toISOString();
    const universal = {
      id: 'pat-universal', artifact_type: 'board_update', pattern_level: 'universal',
      user_id: null, archetype_type: null, confidence: 0.5,
      sections: {}, narrative_model: {}, length_baseline: null, tone_model: null,
      exemplar_count: 5, known_rejection_triggers: [], created_at: now, updated_at: now,
    };
    const db = createMockSupabase({ listResult: { data: [universal], error: null } });
    const { instance } = makeIntelligence(db);

    const pattern = await instance.domains.artifact.getPattern('board_update', 'u-with-no-calibration');
    expect(pattern!.id).toBe('pat-universal');
    expect(pattern!.patternLevel).toBe('universal');
  });
});
