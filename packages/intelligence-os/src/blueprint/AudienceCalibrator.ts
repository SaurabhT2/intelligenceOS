/**
 * AudienceCalibrator.ts
 *
 * Assembles audience intelligence for blueprint assembly.
 *
 * Phase 1 behaviour (Contracts J.2):
 *   Named relationship calibration is NOT active in Phase 1.
 *   The only path is generic audience profiles keyed on audience_type.
 *
 *   Priority:
 *     1. Stored generic AudienceProfile for this user + audienceType (highest specificity)
 *     2. System defaults for the audienceType (when no stored profile exists)
 *     3. System default calibration (when no audienceRef provided at all)
 *
 *   If audienceRef.relationshipId is provided: silently fall back to
 *   audienceRef.audienceType if present, otherwise use system defaults.
 *   Phase 2 will add RelationshipIntelligenceDomain.getNamedAudienceProfile().
 *
 * Never throws — missing audience data is normal and results in conservative defaults.
 */

import type { AudienceCalibration, AudienceReference } from '@intelligence-os/shared-types';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { AudienceProfile } from '../types/entities';
import {
  DEFAULT_AUDIENCE_CALIBRATION,
  AUDIENCE_TYPE_DEFAULTS,
} from './internal/defaults';
import { trackedCatch } from './internal/trackedFetch';

export interface AudienceCalibratorResult {
  calibration:   AudienceCalibration;
  /** The stored AudienceProfile that was used, or null when falling back to system defaults. */
  sourceProfile: AudienceProfile | null;
  /** True only when the stored-profile fetch errored and fell back — not
   *  when there was simply no audienceRef, no audienceType, or no stored
   *  profile to find. Those are normal Phase 1 paths, not degradation. */
  degraded:      boolean;
}

export class AudienceCalibrator {
  constructor(private readonly userDomain: UserIntelligenceDomain) {}

  async calibrate(
    userId:      string,
    audienceRef: AudienceReference | undefined,
  ): Promise<AudienceCalibratorResult> {
    // Phase 2 path: named relationship calibration (not implemented in Phase 1).
    // Decision: fall back silently rather than throw — blueprint generation must
    // not fail because a caller passed a Phase-2-only reference.
    if (audienceRef?.relationshipId && !audienceRef.audienceType) {
      // No audienceType to fall back to — return system defaults.
      return { calibration: DEFAULT_AUDIENCE_CALIBRATION, sourceProfile: null, degraded: false };
    }

    const audienceType = audienceRef?.audienceType;

    if (!audienceType) {
      return { calibration: DEFAULT_AUDIENCE_CALIBRATION, sourceProfile: null, degraded: false };
    }

    // Attempt to load stored generic audience profile.
    const storedProfileResult = await trackedCatch(
      this.userDomain.getGenericAudienceProfile(userId, audienceType),
      null,
    );

    if (storedProfileResult.value) {
      return {
        calibration:   this.fromStoredProfile(storedProfileResult.value, audienceType),
        sourceProfile: storedProfileResult.value,
        degraded:      false,
      };
    }

    // No stored profile — use system defaults for this audience type.
    // (storedProfileResult.failed distinguishes "fetch errored" from
    // "fetch succeeded but found nothing," which a bare null cannot.)
    return {
      calibration:   this.fromSystemDefaults(audienceType),
      sourceProfile: null,
      degraded:      storedProfileResult.failed,
    };
  }

  private fromStoredProfile(
    profile:      AudienceProfile,
    audienceType: string,
  ): AudienceCalibration {
    return {
      isNamedRelationship: false,
      audienceType:        audienceType as AudienceCalibration['audienceType'],
      expertiseLevel:      profile.expertiseLevel as AudienceCalibration['expertiseLevel'],
      communicationNorms:  profile.communicationNorms,
      knownSensitivities:  profile.knownSensitivities,
      confidence:          profile.confidence,
    };
  }

  private fromSystemDefaults(audienceType: string): AudienceCalibration {
    const defaults = AUDIENCE_TYPE_DEFAULTS[audienceType];
    return {
      isNamedRelationship: false,
      audienceType:        audienceType as AudienceCalibration['audienceType'],
      expertiseLevel:      defaults?.expertiseLevel ?? 'informed',
      communicationNorms:  {},
      knownSensitivities:  {},
      // Low confidence signals to downstream components that this is inferred, not stored.
      confidence:          0.3,
    };
  }
}
