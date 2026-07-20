/**
 * SignalExtractor.test.ts
 *
 * Unit tests for Stage 1 of the Learning Pipeline.
 * No DB required — SignalExtractor is pure in-memory.
 */

import { describe, it, expect } from 'vitest';
import { SignalExtractor } from '../../../src/pipeline/SignalExtractor';
import type { FeedbackEventPayload } from '../../../src/types/events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFeedbackPayload(
  overrides: Partial<FeedbackEventPayload> = {},
): FeedbackEventPayload {
  return {
    userId:      'user-001',
    artifactId:  'artifact-001',
    artifactType: 'executive_summary',
    eventType:   'accepted',
    occurredAt:  new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SignalExtractor', () => {
  const extractor = new SignalExtractor();

  describe('extractFromFeedback', () => {
    it('produces at least one signal for a valid accepted event', () => {
      const signals = extractor.extractFromFeedback(makeFeedbackPayload({ eventType: 'accepted' }));
      expect(signals.length).toBeGreaterThan(0);
    });

    it('produces signals for every supported event type', () => {
      const types = ['accepted', 'edited', 'rejected', 'deployed', 'explicit_feedback'] as const;
      for (const eventType of types) {
        const signals = extractor.extractFromFeedback(makeFeedbackPayload({ eventType }));
        expect(signals.length, `expected signals for eventType=${eventType}`).toBeGreaterThan(0);
      }
    });

    it('sets userId and artifactId on every signal', () => {
      const signals = extractor.extractFromFeedback(
        makeFeedbackPayload({ userId: 'u-42', artifactId: 'art-99', eventType: 'deployed' }),
      );
      for (const s of signals) {
        expect(s.userId).toBe('u-42');
        expect(s.sourceRef).toBe('art-99');
      }
    });

    it('classifies deployed as demonstrated_behavior source quality (via rawContent)', () => {
      const signals = extractor.extractFromFeedback(makeFeedbackPayload({ eventType: 'deployed' }));
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0]!.rawContent['sourceQuality']).toBe('demonstrated_behavior');
    });

    it('classifies explicit_feedback as explicit_statement source quality', () => {
      const signals = extractor.extractFromFeedback(
        makeFeedbackPayload({ eventType: 'explicit_feedback', explicitReason: 'Too long' }),
      );
      expect(signals[0]!.rawContent['sourceQuality']).toBe('explicit_statement');
      expect(signals[0]!.sourceType).toBe('explicit_statement');
    });

    it('classifies edited as edit_diff source type', () => {
      const signals = extractor.extractFromFeedback(
        makeFeedbackPayload({
          eventType: 'edited',
          editDiff: {
            sectionsAdded: [],
            sectionsRemoved: [],
            sectionsReordered: false,
            lengthDelta: -100,
            vocabularyChanges: [],
          },
        }),
      );
      const editSignal = signals.find(s => s.sourceType === 'edit_diff');
      expect(editSignal).toBeDefined();
    });

    it('returns empty array when userId is missing', () => {
      const signals = extractor.extractFromFeedback(
        makeFeedbackPayload({ userId: '' }),
      );
      expect(signals).toHaveLength(0);
    });

    it('returns empty array when artifactId is missing', () => {
      const signals = extractor.extractFromFeedback(
        makeFeedbackPayload({ artifactId: '' }),
      );
      expect(signals).toHaveLength(0);
    });

    it('assigns a taxonomy category to every signal', () => {
      const signals = extractor.extractFromFeedback(makeFeedbackPayload({ eventType: 'accepted' }));
      for (const s of signals) {
        expect(s.taxonomyCategory).toBeTruthy();
      }
    });

    it('sets isQuarantined = false for normal feedback events', () => {
      const signals = extractor.extractFromFeedback(makeFeedbackPayload({ eventType: 'accepted' }));
      for (const s of signals) {
        expect(s.isQuarantined).toBe(false);
      }
    });

    it('sets projectId from event.projectId', () => {
      const signals = extractor.extractFromFeedback(
        makeFeedbackPayload({ projectId: 'proj-123' }),
      );
      for (const s of signals) {
        expect(s.projectId).toBe('proj-123');
      }
    });

    it('sets projectId to null when no projectId on event', () => {
      const signals = extractor.extractFromFeedback(makeFeedbackPayload());
      for (const s of signals) {
        expect(s.projectId).toBeNull();
      }
    });

    it('generates unique ids for each signal', () => {
      const signals = extractor.extractFromFeedback(makeFeedbackPayload({ eventType: 'deployed' }));
      const ids = signals.map(s => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe('shouldQuarantine', () => {
    it('returns quarantine=false for empty flags', () => {
      const result = extractor.shouldQuarantine([]);
      expect(result.quarantine).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('quarantines role_play flag', () => {
      const result = extractor.shouldQuarantine(['role_play']);
      expect(result.quarantine).toBe(true);
      expect(result.reason).toContain('role_play');
    });

    it('quarantines hypothetical flag', () => {
      const result = extractor.shouldQuarantine(['hypothetical']);
      expect(result.quarantine).toBe(true);
    });

    it('quarantines emotional_state flag', () => {
      const result = extractor.shouldQuarantine(['emotional_state']);
      expect(result.quarantine).toBe(true);
    });

    it('quarantines when one of multiple flags is a quarantine flag', () => {
      const result = extractor.shouldQuarantine(['normal_flag', 'role_play']);
      expect(result.quarantine).toBe(true);
    });

    it('does not quarantine unrecognised flags', () => {
      const result = extractor.shouldQuarantine(['work_context', 'formal_tone']);
      expect(result.quarantine).toBe(false);
    });
  });

  // ── ADR-003 (Subject-Centric Intelligence): Workspace observation path ────

  describe('extractFromObservation()', () => {
    function makeObservationInput(overrides: Partial<import('@platform/cognition-contract').ObservationInput> = {}) {
      return {
        workspaceId: 'ws-001',
        requestId: 'req-001',
        outputText: 'Some generated artifact text.',
        score: 0.82,
        ...overrides,
      };
    }

    it('produces a workspace-subject success_metrics signal for a meaningful score', () => {
      const signals = extractor.extractFromObservation(makeObservationInput());

      const successSignal = signals.find(s => s.taxonomyCategory === 'success_metrics');
      expect(successSignal).toBeDefined();
      expect(successSignal!.subjectType).toBe('workspace');
      expect(successSignal!.workspaceId).toBe('ws-001');
      expect(successSignal!.userId).toBeNull();
    });

    it('returns an empty array for a placeholder score of 0 (BrandOS pre-governance fire)', () => {
      const signals = extractor.extractFromObservation(makeObservationInput({ score: 0 }));
      expect(signals).toEqual([]);
    });

    it('returns an empty array when workspaceId or requestId is missing', () => {
      expect(extractor.extractFromObservation(makeObservationInput({ workspaceId: '' }))).toEqual([]);
      expect(extractor.extractFromObservation(makeObservationInput({ requestId: '' }))).toEqual([]);
    });

    it('additionally emits an expertise_domains signal when a topic is reported', () => {
      const signals = extractor.extractFromObservation(makeObservationInput({ topic: 'quarterly-earnings' }));

      const topicSignal = signals.find(s => s.taxonomyCategory === 'expertise_domains');
      expect(topicSignal).toBeDefined();
      expect(topicSignal!.rawContent['topic']).toBe('quarterly-earnings');
    });

    it('does not emit an expertise_domains signal when no topic is reported', () => {
      const signals = extractor.extractFromObservation(makeObservationInput({ topic: undefined }));
      expect(signals.find(s => s.taxonomyCategory === 'expertise_domains')).toBeUndefined();
    });

    it('downgrades source quality to inferred for a governance-repaired artifact', () => {
      const signals = extractor.extractFromObservation(makeObservationInput({ wasRepaired: true }));
      const successSignal = signals.find(s => s.taxonomyCategory === 'success_metrics')!;
      expect(successSignal.rawContent['sourceQuality']).toBe('inferred');
    });

    it('normalizes a 0-100 governance score onto a 0-1 scale', () => {
      const signals = extractor.extractFromObservation(makeObservationInput({ score: 82 }));
      const successSignal = signals.find(s => s.taxonomyCategory === 'success_metrics')!;
      expect(successSignal.rawContent['normalizedScore']).toBeCloseTo(0.82);
    });

    // G-22 (Architecture Verification Report, P2) — several BrandOS-side
    // comments referenced a nonexistent "Gate 1 (score < 75)" threshold;
    // the actual gate is `isMeaningfulScore(score) = score > 0` (this
    // file, top of extractFromObservation()'s implementation). This test
    // documents the real, current behavior for a governance-FAILED
    // observation (score: 50 is below BrandOS's approval/governance
    // thresholds, which sit around 70-90 depending on artifact type — see
    // @brandos/governance-config — but 50 is still > 0). Whether a
    // governance-failed artifact's observation *should* still produce
    // Learning Pipeline signals is a separate product question the
    // Verification Report explicitly scoped OUT of this finding — this
    // test only pins down what the code actually does today, so a future
    // change to that behavior is a deliberate, visible decision rather
    // than an untested regression.
    it('produces signals for a governance-failed score of 50 (score > 0 gate, not a pass/fail threshold — documents current behavior, see G-22)', () => {
      const signals = extractor.extractFromObservation(makeObservationInput({ score: 50 }));

      const successSignal = signals.find(s => s.taxonomyCategory === 'success_metrics');
      expect(successSignal).toBeDefined();
      expect(successSignal!.rawContent['normalizedScore']).toBeCloseTo(0.5);
    });
  });
});
