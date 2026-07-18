/**
 * RelationshipActivationTrigger.test.ts
 *
 * Dedicated unit tests for the Phase 2 activation-trigger counting logic
 * (Contracts §J.3: "≥3 external artifacts with named recipients exist, OR
 * an explicit trigger from user onboarding signals the need"), added
 * during the IntelligenceOS Completion Plan execution session. Closes the
 * gap `IMPLEMENTATION_STATUS.md`'s Known Issues previously flagged:
 * "the docblock states an activation trigger, but no code anywhere counts
 * this or flips any switch."
 *
 * Two things are tested here:
 *   1. `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients()` —
 *      the real Supabase-backed count of `artifact_blueprints` rows whose
 *      `audience_calibration.isNamedRelationship` is true.
 *   2. `RelationshipIntelligenceDomain.checkActivationTrigger()` — the
 *      decision built on top of that count, plus the onboarding-signal
 *      escape hatch. Every stub method on `RelationshipIntelligenceDomain`
 *      itself is intentionally untouched by this addition and continues
 *      to throw `DomainNotActivatedError` regardless of what this check
 *      returns — see the method's own docblock for why.
 */

import { describe, it, expect, vi } from 'vitest';
import { ArtifactIntelligenceDomain } from '../../../src/domains/ArtifactIntelligenceDomain';
import { RelationshipIntelligenceDomain } from '../../../src/domains/RelationshipIntelligenceDomain';
import { DomainNotActivatedError } from '../../../src/errors';

// ── DB mock helper for countArtifactsWithNamedRecipients ────────────────────
// Chain: schema → from → select → eq(user_id) → contains(audience_calibration) → { count, error }

function makeCountDb(count: number | null, error?: { message: string }) {
  const containsFn = vi.fn().mockResolvedValue({ count, error: error ?? null });
  const eqFn       = vi.fn().mockReturnValue({ contains: containsFn });
  const selectFn   = vi.fn().mockReturnValue({ eq: eqFn });
  const from       = vi.fn().mockReturnValue({ select: selectFn });
  return {
    db: { schema: vi.fn().mockReturnValue({ from }) } as unknown as import('@supabase/supabase-js').SupabaseClient,
    eqFn,
    containsFn,
  };
}

describe('ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients()', () => {
  it('returns the count from the database', async () => {
    const { db } = makeCountDb(5);
    const domain = new ArtifactIntelligenceDomain(db);

    const count = await domain.countArtifactsWithNamedRecipients('user-001');
    expect(count).toBe(5);
  });

  it('returns 0 when count is null', async () => {
    const { db } = makeCountDb(null);
    const domain = new ArtifactIntelligenceDomain(db);

    const count = await domain.countArtifactsWithNamedRecipients('user-001');
    expect(count).toBe(0);
  });

  it('filters by user_id and by audience_calibration containing isNamedRelationship: true', async () => {
    const { db, eqFn, containsFn } = makeCountDb(2);
    const domain = new ArtifactIntelligenceDomain(db);

    await domain.countArtifactsWithNamedRecipients('user-001');

    expect(eqFn).toHaveBeenCalledWith('user_id', 'user-001');
    expect(containsFn).toHaveBeenCalledWith('audience_calibration', { isNamedRelationship: true });
  });

  it('throws DatabaseError when the query errors', async () => {
    const { db } = makeCountDb(null, { message: 'connection lost' });
    const domain = new ArtifactIntelligenceDomain(db);

    await expect(domain.countArtifactsWithNamedRecipients('user-001')).rejects.toThrow(
      'Failed to count named-recipient artifacts for user user-001',
    );
  });
});

describe('RelationshipIntelligenceDomain.checkActivationTrigger()', () => {
  function makeArtifactDomain(count: number) {
    return {
      countArtifactsWithNamedRecipients: vi.fn().mockResolvedValue(count),
    } as unknown as ArtifactIntelligenceDomain;
  }

  it('does not activate when the named-recipient artifact count is below 3', async () => {
    const relationshipDomain = new RelationshipIntelligenceDomain({} as import('@supabase/supabase-js').SupabaseClient);
    const artifactDomain = makeArtifactDomain(2);

    const result = await relationshipDomain.checkActivationTrigger('user-001', artifactDomain);

    expect(result.shouldActivate).toBe(false);
    expect(result.namedRecipientArtifactCount).toBe(2);
    expect(result.reason).toContain('below threshold');
  });

  it('activates exactly at the threshold of 3 named-recipient artifacts', async () => {
    const relationshipDomain = new RelationshipIntelligenceDomain({} as import('@supabase/supabase-js').SupabaseClient);
    const artifactDomain = makeArtifactDomain(3);

    const result = await relationshipDomain.checkActivationTrigger('user-001', artifactDomain);

    expect(result.shouldActivate).toBe(true);
    expect(result.namedRecipientArtifactCount).toBe(3);
  });

  it('activates above the threshold too', async () => {
    const relationshipDomain = new RelationshipIntelligenceDomain({} as import('@supabase/supabase-js').SupabaseClient);
    const artifactDomain = makeArtifactDomain(10);

    const result = await relationshipDomain.checkActivationTrigger('user-001', artifactDomain);

    expect(result.shouldActivate).toBe(true);
  });

  it('activates on an explicit onboarding signal regardless of the artifact count', async () => {
    const relationshipDomain = new RelationshipIntelligenceDomain({} as import('@supabase/supabase-js').SupabaseClient);
    const artifactDomain = makeArtifactDomain(0);

    const result = await relationshipDomain.checkActivationTrigger('user-001', artifactDomain, true);

    expect(result.shouldActivate).toBe(true);
    expect(result.reason).toBe('Explicit onboarding signal');
  });

  it('defaults explicitOnboardingSignal to false when omitted', async () => {
    const relationshipDomain = new RelationshipIntelligenceDomain({} as import('@supabase/supabase-js').SupabaseClient);
    const artifactDomain = makeArtifactDomain(1);

    const result = await relationshipDomain.checkActivationTrigger('user-001', artifactDomain);

    expect(result.shouldActivate).toBe(false);
  });

  it('does not change any stub method — every other method still throws DomainNotActivatedError regardless of trigger state', async () => {
    const relationshipDomain = new RelationshipIntelligenceDomain({} as import('@supabase/supabase-js').SupabaseClient);
    const artifactDomain = makeArtifactDomain(100); // trigger clearly fired

    await relationshipDomain.checkActivationTrigger('user-001', artifactDomain);

    await expect(relationshipDomain.getRelationship('rel-1')).rejects.toThrow(DomainNotActivatedError);
    await expect(relationshipDomain.getActiveRelationships('user-001')).rejects.toThrow(DomainNotActivatedError);
    await expect(relationshipDomain.getNamedAudienceProfile('rel-1')).rejects.toThrow(DomainNotActivatedError);
  });
});
