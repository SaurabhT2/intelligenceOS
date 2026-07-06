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
 *
 * Nothing in Sprint 0–3 calls any of these methods.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Relationship, AudienceProfile } from '../types/entities';
import { DomainNotActivatedError } from '../errors';

const ACTIVATION_PHASE = 'Phase 2 (Relationship Intelligence — see Contracts J.3 for activation triggers)';

export class RelationshipIntelligenceDomain {
  // db held in reserve for Phase 2 implementation; unused in Phase 1.
  constructor(private readonly _db: SupabaseClient) {}

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
