/**
 * AudienceCalibrator.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudienceCalibrator } from '../../../src/blueprint/AudienceCalibrator';
import { DEFAULT_AUDIENCE_CALIBRATION, AUDIENCE_TYPE_DEFAULTS } from '../../../src/blueprint/internal/defaults';
import type { AudienceProfile } from '../../../src/types/entities';

function makeUserDomain(profileResult: AudienceProfile | null = null) {
  return {
    getGenericAudienceProfile: vi.fn().mockResolvedValue(profileResult),
  };
}

const BOARD_PROFILE: AudienceProfile = {
  id:                'ap-1',
  userId:            'u1',
  ownerType:         'generic',
  relationshipId:    null,
  audienceType:      'board',
  expertiseLevel:    'practitioner',
  communicationNorms: { preferDirectness: true },
  knownSensitivities: { avoidTopics: ['compensation'] },
  confidence:        0.85,
  isActive:          true,
  createdAt:         new Date(),
  updatedAt:         new Date(),
};

describe('AudienceCalibrator', () => {
  let calibrator: AudienceCalibrator;

  // ── No audience reference ─────────────────────────────────────────────────

  describe('no audienceRef', () => {
    it('returns DEFAULT_AUDIENCE_CALIBRATION', async () => {
      calibrator = new AudienceCalibrator(makeUserDomain() as any);
      const { calibration, sourceProfile } = await calibrator.calibrate('u1', undefined);
      expect(calibration).toEqual(DEFAULT_AUDIENCE_CALIBRATION);
      expect(sourceProfile).toBeNull();
    });

    it('does not call the domain', async () => {
      const domain = makeUserDomain();
      calibrator = new AudienceCalibrator(domain as any);
      await calibrator.calibrate('u1', undefined);
      expect(domain.getGenericAudienceProfile).not.toHaveBeenCalled();
    });
  });

  // ── Stored generic audience profile ──────────────────────────────────────

  describe('audienceRef.audienceType with stored profile', () => {
    beforeEach(() => {
      calibrator = new AudienceCalibrator(makeUserDomain(BOARD_PROFILE) as any);
    });

    it('maps stored profile to AudienceCalibration', async () => {
      const { calibration } = await calibrator.calibrate('u1', { audienceType: 'board' });
      expect(calibration.isNamedRelationship).toBe(false);
      expect(calibration.audienceType).toBe('board');
      expect(calibration.expertiseLevel).toBe('practitioner');
      expect(calibration.confidence).toBe(0.85);
      expect(calibration.communicationNorms).toEqual({ preferDirectness: true });
      expect(calibration.knownSensitivities).toEqual({ avoidTopics: ['compensation'] });
    });

    it('sets sourceProfile to the loaded profile', async () => {
      const { sourceProfile } = await calibrator.calibrate('u1', { audienceType: 'board' });
      expect(sourceProfile).toEqual(BOARD_PROFILE);
    });

    it('calls domain with correct userId and audienceType', async () => {
      const domain = makeUserDomain(BOARD_PROFILE);
      calibrator = new AudienceCalibrator(domain as any);
      await calibrator.calibrate('u1', { audienceType: 'board' });
      expect(domain.getGenericAudienceProfile).toHaveBeenCalledWith('u1', 'board');
    });
  });

  // ── System defaults (no stored profile) ──────────────────────────────────

  describe('audienceRef.audienceType with NO stored profile', () => {
    it('returns system defaults for investor', async () => {
      calibrator = new AudienceCalibrator(makeUserDomain(null) as any);
      const { calibration, sourceProfile } = await calibrator.calibrate('u1', { audienceType: 'investor' });
      expect(calibration.audienceType).toBe('investor');
      expect(calibration.expertiseLevel).toBe(AUDIENCE_TYPE_DEFAULTS['investor']!.expertiseLevel);
      expect(calibration.confidence).toBe(0.3); // system-default confidence
      expect(calibration.isNamedRelationship).toBe(false);
      expect(sourceProfile).toBeNull();
    });

    it('returns system defaults for engineering', async () => {
      calibrator = new AudienceCalibrator(makeUserDomain(null) as any);
      const { calibration } = await calibrator.calibrate('u1', { audienceType: 'engineering' });
      expect(calibration.expertiseLevel).toBe('expert');
    });

    it('returns system defaults for customer', async () => {
      calibrator = new AudienceCalibrator(makeUserDomain(null) as any);
      const { calibration } = await calibrator.calibrate('u1', { audienceType: 'customer' });
      expect(calibration.expertiseLevel).toBe('informed');
    });
  });

  // ── Phase 2 relationship path ─────────────────────────────────────────────

  describe('audienceRef.relationshipId only (Phase 2 not active)', () => {
    it('returns system defaults when relationshipId is the only ref', async () => {
      calibrator = new AudienceCalibrator(makeUserDomain(null) as any);
      const { calibration } = await calibrator.calibrate('u1', { relationshipId: 'rel-uuid' });
      expect(calibration).toEqual(DEFAULT_AUDIENCE_CALIBRATION);
    });

    it('falls back to audienceType when both relationshipId and audienceType provided', async () => {
      calibrator = new AudienceCalibrator(makeUserDomain(null) as any);
      const { calibration } = await calibrator.calibrate('u1', {
        relationshipId: 'rel-uuid',
        audienceType:   'board',
      });
      expect(calibration.audienceType).toBe('board');
    });
  });

  // ── Domain failure resilience ─────────────────────────────────────────────

  describe('domain call failure', () => {
    it('returns system defaults and null sourceProfile when domain throws', async () => {
      const domain = {
        getGenericAudienceProfile: vi.fn().mockRejectedValue(new Error('DB down')),
      };
      calibrator = new AudienceCalibrator(domain as any);
      const { calibration, sourceProfile } = await calibrator.calibrate('u1', { audienceType: 'board' });
      expect(calibration.audienceType).toBe('board');
      expect(calibration.confidence).toBe(0.3);
      expect(sourceProfile).toBeNull();
    });
  });
});
