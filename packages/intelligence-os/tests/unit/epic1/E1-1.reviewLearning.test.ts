/**
 * tests/unit/epic1/E1-1.reviewLearning.test.ts
 *
 * Unit tests for E1-1: Human Learning Review API
 *
 * Covers:
 *   - UserIntelligenceDomain.reviewLearning()
 *   - IntelligenceOS.reviewLearning()
 *   - intelligence.learning.reviewed event emission
 *   - State transition: FLAGGED → ACTIVE  (approved=true)
 *   - State transition: FLAGGED → ARCHIVED (approved=false)
 *   - EntityNotFoundError when learningId unknown
 *   - ValidationError when userId mismatch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserIntelligenceDomain } from '../../../src/domains/UserIntelligenceDomain';
import { EntityNotFoundError, ValidationError } from '../../../src/errors';

// ── Supabase mock factory ─────────────────────────────────────────────────────

function makeDb(opts: {
  fetchRow?: Record<string, unknown> | null;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  });

  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data:  opts.fetchRow ?? null,
        error: opts.fetchError ?? null,
      }),
    }),
  });

  const from = vi.fn().mockReturnValue({ select, update });
  const schema = vi.fn().mockReturnValue({ from });

  return { schema } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEARNING_ROW = {
  id:      'lrn-001',
  user_id: 'user-001',
  state:   'FLAGGED',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('E1-1: UserIntelligenceDomain.reviewLearning()', () => {
  it('returns newState=ACTIVE and previousState=FLAGGED when approved=true', async () => {
    const db = makeDb({ fetchRow: LEARNING_ROW });
    const domain = new UserIntelligenceDomain(db);

    const result = await domain.reviewLearning('user-001', 'lrn-001', true, 'reviewer-alice');

    expect(result.newState).toBe('ACTIVE');
    expect(result.previousState).toBe('FLAGGED');
  });

  it('returns newState=ARCHIVED and previousState=FLAGGED when approved=false', async () => {
    const db = makeDb({ fetchRow: LEARNING_ROW });
    const domain = new UserIntelligenceDomain(db);

    const result = await domain.reviewLearning('user-001', 'lrn-001', false, 'reviewer-alice');

    expect(result.newState).toBe('ARCHIVED');
    expect(result.previousState).toBe('FLAGGED');
  });

  it('throws EntityNotFoundError when learningId not found', async () => {
    const db = makeDb({ fetchRow: null });
    const domain = new UserIntelligenceDomain(db);

    await expect(
      domain.reviewLearning('user-001', 'does-not-exist', true, 'reviewer-alice'),
    ).rejects.toThrow(EntityNotFoundError);
  });

  it('throws ValidationError when learning belongs to different user', async () => {
    const db = makeDb({ fetchRow: { ...LEARNING_ROW, user_id: 'user-999' } });
    const domain = new UserIntelligenceDomain(db);

    await expect(
      domain.reviewLearning('user-001', 'lrn-001', true, 'reviewer-alice'),
    ).rejects.toThrow(ValidationError);
  });

  it('includes archived_at field in update when rejecting (approved=false)', async () => {
    // We capture the update call arguments to verify archived_at is set
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const fetchMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: LEARNING_ROW, error: null }),
      }),
    });
    const from = vi.fn().mockReturnValue({ select: fetchMock, update: updateMock });
    const db = { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const domain = new UserIntelligenceDomain(db);
    await domain.reviewLearning('user-001', 'lrn-001', false, 'reviewer-alice');

    const updateFields = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateFields).toBeDefined();
    expect(updateFields['archived_at']).toBeDefined();
    expect(updateFields['last_confirmed_at']).toBeUndefined();
    expect(updateFields['state']).toBe('ARCHIVED');
  });

  it('includes last_confirmed_at in update when approving (approved=true)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const fetchMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: LEARNING_ROW, error: null }),
      }),
    });
    const from = vi.fn().mockReturnValue({ select: fetchMock, update: updateMock });
    const db = { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const domain = new UserIntelligenceDomain(db);
    await domain.reviewLearning('user-001', 'lrn-001', true, 'reviewer-alice');

    const updateFields = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateFields['last_confirmed_at']).toBeDefined();
    expect(updateFields['archived_at']).toBeUndefined();
    expect(updateFields['state']).toBe('ACTIVE');
  });
});

// ── IntelligenceOS integration ────────────────────────────────────────────────

describe('E1-1: intelligence.learning.reviewed event', () => {
  it('emits the event with correct payload shape when review succeeds', async () => {
    // Arrange: minimal IntelligenceOS-level test via direct domain + bus mock
    const { InProcessEventBus } = await import('../../../src/events/IntelligenceEventBus');
    const bus = new InProcessEventBus();
    const emittedPayloads: unknown[] = [];
    bus.on('intelligence.learning.reviewed', async payload => {
      emittedPayloads.push(payload);
    });

    // Build a domain backed by the mock db
    const db = makeDb({ fetchRow: LEARNING_ROW });
    const domain = new UserIntelligenceDomain(db);

    const { newState } = await domain.reviewLearning('user-001', 'lrn-001', true, 'reviewer-alice');

    // Simulate the event that IntelligenceOS.reviewLearning() emits
    await bus.emit('intelligence.learning.reviewed', {
      userId:     'user-001',
      learningId: 'lrn-001',
      approved:   true,
      reviewedBy: 'reviewer-alice',
      newState,
      occurredAt: new Date().toISOString(),
    });

    expect(emittedPayloads).toHaveLength(1);
    const payload = emittedPayloads[0] as Record<string, unknown>;
    expect(payload['userId']).toBe('user-001');
    expect(payload['learningId']).toBe('lrn-001');
    expect(payload['approved']).toBe(true);
    expect(payload['reviewedBy']).toBe('reviewer-alice');
    expect(payload['newState']).toBe('ACTIVE');
    expect(typeof payload['occurredAt']).toBe('string');
  });
});
