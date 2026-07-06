/**
 * M2-context.voiceMapping.test.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * Pure-function tests for context/voiceMapping.ts — no DB, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveVoiceProfile,
  deriveConfidence,
  deriveLastConsolidatedAt,
} from '../../../src/context/voiceMapping';
import type { Learning } from '../../../src/types/entities';

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'lrn-1',
    userId: 'user-1',
    workspaceId: 'ws-1',
    projectId: null,
    domain: 'artifact_intelligence' as Learning['domain'],
    taxonomyCategory: 'communication_style',
    stabilityClass: 'medium_term',
    state: 'ACTIVE',
    confidence: 0.8,
    contextScope: 'global',
    contextArtifactType: null,
    contextProjectId: null,
    contextAudienceType: null,
    content: {},
    sourceSummary: {},
    decayRate: 'standard',
    lastConfirmedAt: null,
    decayStartedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('deriveVoiceProfile()', () => {
  it('returns the same defaults as createDegradedCognitionContext when there are no voice-relevant learnings', () => {
    const voice = deriveVoiceProfile([]);
    expect(voice).toEqual({
      tone: 'professional',
      cadence: 'medium',
      audienceType: 'general',
      executiveLevel: false,
      domain: 'general',
      bannedPhrases: [],
    });
  });

  it('ignores learnings outside the voice-relevant taxonomy categories', () => {
    const voice = deriveVoiceProfile([
      makeLearning({ taxonomyCategory: 'goals_and_objectives', content: { tone: 'quirky' } }),
    ]);
    expect(voice.tone).toBe('professional'); // default, not 'quirky'
  });

  it('applies fields found on a single voice-relevant learning', () => {
    const voice = deriveVoiceProfile([
      makeLearning({
        taxonomyCategory: 'writing_style',
        content: { tone: 'authoritative', cadence: 'short', bannedPhrases: ['synergy'] },
      }),
    ]);
    expect(voice.tone).toBe('authoritative');
    expect(voice.cadence).toBe('short');
    expect(voice.bannedPhrases).toEqual(['synergy']);
  });

  it('lets the higher-confidence learning win when two disagree on the same field', () => {
    const voice = deriveVoiceProfile([
      makeLearning({ taxonomyCategory: 'writing_style', confidence: 0.9, content: { tone: 'authoritative' } }),
      makeLearning({ taxonomyCategory: 'writing_style', confidence: 0.4, content: { tone: 'casual' } }),
    ]);
    expect(voice.tone).toBe('authoritative');
  });

  it('ignores malformed content fields rather than throwing', () => {
    const voice = deriveVoiceProfile([
      makeLearning({
        taxonomyCategory: 'communication_style',
        content: { cadence: 'not-a-real-cadence', executiveLevel: 'yes' as unknown, bannedPhrases: 'not-an-array' },
      }),
    ]);
    expect(voice.cadence).toBe('medium'); // default — invalid value rejected
    expect(voice.executiveLevel).toBe(false); // default — wrong type rejected
    expect(voice.bannedPhrases).toEqual([]); // default — wrong type rejected
  });

  it('includes optional additive fields only when present', () => {
    const withBrand = deriveVoiceProfile([
      makeLearning({ taxonomyCategory: 'writing_style', content: { brandName: 'Acme' } }),
    ]);
    expect(withBrand.brandName).toBe('Acme');

    const without = deriveVoiceProfile([makeLearning({ taxonomyCategory: 'writing_style', content: {} })]);
    expect(without.brandName).toBeUndefined();
  });
});

describe('deriveConfidence()', () => {
  it('returns "degraded" for an empty learning set', () => {
    expect(deriveConfidence([])).toBe('degraded');
  });

  it('returns "high" when average confidence >= 0.75', () => {
    expect(deriveConfidence([makeLearning({ confidence: 0.9 }), makeLearning({ confidence: 0.8 })])).toBe('high');
  });

  it('returns "medium" when average confidence is between 0.5 and 0.75', () => {
    expect(deriveConfidence([makeLearning({ confidence: 0.6 })])).toBe('medium');
  });

  it('returns "low" when average confidence is below 0.5', () => {
    expect(deriveConfidence([makeLearning({ confidence: 0.2 })])).toBe('low');
  });
});

describe('deriveLastConsolidatedAt()', () => {
  it('returns null for an empty set', () => {
    expect(deriveLastConsolidatedAt([])).toBeNull();
  });

  it('returns the most recent updatedAt as an ISO string', () => {
    const older = makeLearning({ updatedAt: new Date('2026-01-01T00:00:00Z') });
    const newer = makeLearning({ updatedAt: new Date('2026-02-15T00:00:00Z') });
    expect(deriveLastConsolidatedAt([older, newer])).toBe(new Date('2026-02-15T00:00:00Z').toISOString());
  });
});
