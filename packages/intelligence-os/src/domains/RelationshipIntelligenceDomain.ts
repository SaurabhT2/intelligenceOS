/**
 * RelationshipIntelligenceDomain.ts
 *
 * Owns: intelligence.relationships, intelligence.audience_profiles (named rows)
 *
 * DEFERRED — Phase 2 activation.
 *
 * Per Contracts Section J.2 and J.3, Relationship Intelligence (named
 * relationship profiling with calibrated audience modelling) is NOT required
 * for Phase 1 GTM. It activates when:
 *   • ≥3 external artifacts with named recipients exist, OR
 *   • an explicit trigger from user onboarding signals the need.
 *
 * Phase 1 audience calibration uses generic Audience Profiles
 * (AudienceProfile.ownerType = 'generic', relationship_id = null), which
 * are owned by UserIntelligenceDomain for Phase 1 and will be migrated to
 * this domain's read path when Relationship Intelligence activates.
 *
 * What's here in Sprint 0:
 *   ✗ getRelationship()          — stub (Phase 2)
 *   ✗ getNamedAudienceProfile()  — stub (Phase 2)
 *   ✗ upsertRelationship()       — stub (Phase 2)
 *   ✗ decayRelationship()        — stub (Phase 2)
 *   ✓ checkActivationTrigger()   — real (added during the IntelligenceOS
 *     Completion Plan execution session); answers "has the Phase 2
 *     activation trigger fired," but does not itself activate anything —
 *     every method above still throws regardless of what it returns.
 *
 * Nothing in Sprint 0–3 calls any of the stub methods above.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Relationship, AudienceProfile } from '../types/entities';
import type { ArtifactIntelligenceDomain } from './ArtifactIntelligenceDomain';
import { DomainNotActivatedError } from '../errors';

const ACTIVATION_PHASE = 'Phase 2 (Relationship Intelligence — see Contracts J.3 for activation triggers)';

/** Contracts §J.3's stated threshold: "User generates ≥3 external artifacts;
 *  named recipients appear consistently." */
const NAMED_RECIPIENT_ARTIFACT_THRESHOLD = 3;

export class RelationshipIntelligenceDomain {
  // db held in reserve for Phase 2 implementation; unused in Phase 1.
  constructor(private readonly _db: SupabaseClient) {}

  /**
   * Evaluates whether Contracts §J.3's Phase 2 activation trigger has
   * fired for a user: "≥3 external artifacts with named recipients exist,
   * OR an explicit trigger from user onboarding signals the need."
   *
   * This closes the gap `IMPLEMENTATION_STATUS.md` flagged — "the
   * docblock states an activation trigger, but no code anywhere counts
   * this or flips any switch" — for the *counting* half. It deliberately
   * does **not** flip any switch itself: every other method on this class
   * still throws `DomainNotActivatedError` regardless of what this method
   * returns. Building real named-relationship storage and read paths
   * (migrating generic Audience Profiles to specific ones, wiring
   * `AudienceCalibrator`/`BlueprintBuilder` to actually use them) is
   * Phase 2 feature work — a considered, separate decision, the same
   * category of "this needs its own scoped session" this platform already
   * applies to public-contract additions (`ARCHITECTURE.md` §11 Rule 7)
   * and Knowledge-side conflict detection (`ADR-004` §6). What this method
   * gives a caller (an admin tool, an onboarding flow, a future
   * activation script) is a real, queryable answer to "has the trigger
   * fired yet" instead of no answer at all.
   *
   * @param userId                    The user to evaluate.
   * @param artifactDomain            `ArtifactIntelligenceDomain` — owns
   *                                   `artifact_blueprints`, the table the
   *                                   artifact-count half of the trigger
   *                                   reads from. Passed in explicitly
   *                                   (rather than this class holding its
   *                                   own reference) because this class's
   *                                   own `_db` field is reserved for its
   *                                   own tables (`relationships`,
   *                                   `audience_profiles`) — the same
   *                                   domain-ownership boundary every
   *                                   cross-domain read in this codebase
   *                                   follows.
   * @param explicitOnboardingSignal  The other half of Contracts §J.3's
   *                                   trigger: "an explicit trigger from
   *                                   user onboarding signals the need."
   *                                   No onboarding flow that could supply
   *                                   this exists yet anywhere in this
   *                                   codebase, so it defaults to `false`
   *                                   — a caller passes `true` only once
   *                                   such a flow is built and fires it.
   */
  async checkActivationTrigger(
    userId: string,
    artifactDomain: ArtifactIntelligenceDomain,
    explicitOnboardingSignal = false,
  ): Promise<{ shouldActivate: boolean; namedRecipientArtifactCount: number; reason: string }> {
    if (explicitOnboardingSignal) {
      return {
        shouldActivate: true,
        namedRecipientArtifactCount: await artifactDomain.countArtifactsWithNamedRecipients(userId),
        reason: 'Explicit onboarding signal',
      };
    }

    const namedRecipientArtifactCount = await artifactDomain.countArtifactsWithNamedRecipients(userId);
    const shouldActivate = namedRecipientArtifactCount >= NAMED_RECIPIENT_ARTIFACT_THRESHOLD;

    return {
      shouldActivate,
      namedRecipientArtifactCount,
      reason: shouldActivate
        ? `${namedRecipientArtifactCount} named-recipient artifacts (threshold: ${NAMED_RECIPIENT_ARTIFACT_THRESHOLD})`
        : `${namedRecipientArtifactCount} named-recipient artifacts, below threshold (${NAMED_RECIPIENT_ARTIFACT_THRESHOLD})`,
    };
  }

  /**
   * Returns a named relationship by id.
   * DEFERRED — Phase 2.
   */
  async getRelationship(_relationshipId: string): Promise<Relationship | null> {
    throw new DomainNotActivatedError('RelationshipIntelligenceDomain', ACTIVATION_PHASE);
  }

  /**
   * Returns all active named relationships for a user.
   * DEFERRED — Phase 2.
   */
  async getActiveRelationships(_userId: string): Promise<Relationship[]> {
    throw new DomainNotActivatedError('RelationshipIntelligenceDomain', ACTIVATION_PHASE);
  }

  /**
   * Returns the named audience profile for a specific relationship.
   * DEFERRED — Phase 2.
   *
   * For Phase 1: use UserIntelligenceDomain.getGenericAudienceProfile() instead.
   */
  async getNamedAudienceProfile(_relationshipId: string): Promise<AudienceProfile | null> {
    throw new DomainNotActivatedError('RelationshipIntelligenceDomain', ACTIVATION_PHASE);
  }

  /**
   * Creates or updates a named relationship record.
   * DEFERRED — Phase 2.
   */
  async upsertRelationship(
    _input: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Relationship> {
    throw new DomainNotActivatedError('RelationshipIntelligenceDomain', ACTIVATION_PHASE);
  }

  /**
   * Starts the decay clock on a relationship that has gone dormant.
   * DEFERRED — Phase 2.
   */
  async markDecayStart(_relationshipId: string): Promise<void> {
    throw new DomainNotActivatedError('RelationshipIntelligenceDomain', ACTIVATION_PHASE);
  }
}
