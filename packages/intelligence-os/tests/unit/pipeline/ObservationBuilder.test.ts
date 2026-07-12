/**
 * ObservationBuilder.test.ts
 *
 * Unit tests for Stage 2 of the Learning Pipeline.
 * Tests confidence ceiling enforcement, taxonomy categorisation, and validation.
 */

import { describe, it, expect } from 'vitest';
import { ObservationBuilder } from '../../../src/pipeline/ObservationBuilder';
import { SOURCE_QUALITY_CEILING } from '../../../src/pipeline/types';
import type { Signal } from '../../../src/types/entities';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id:              'sig-001',
    userId:          'user-001',
    workspaceId:     null,
    subjectType:     'user',
    projectId:       null,
    sourceType:      'feedback_event',
    sourceRef:       'artifact-001',
    contextFlags:    [],
    taxonomyCategory:'communication_style',
    rawContent:      { eventType: 'accepted', sourceQuality: 'demonstrated_behavior' },
    isQuarantined:   false,
    quarantineReason: null,
    processedAt:     null,
    createdAt:       new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ObservationBuilder', () => {
  const builder = new ObservationBuilder();

  describe('build', () => {
    it('returns null for a quarantined signal', () => {
      const signal = makeSignal({ isQuarantined: true });
      const obs = builder.build(signal);
      expect(obs).toBeNull();
    });

    it('returns null when taxonomyCategory is missing', () => {
      const signal = makeSignal({ taxonomyCategory: null });
      const obs = builder.build(signal);
      expect(obs).toBeNull();
    });

    it('produces a valid Observation for a clean signal', () => {
      const signal = makeSignal();
      const obs = builder.build(signal);
      expect(obs).not.toBeNull();
      expect(obs!.signalId).toBe('sig-001');
      expect(obs!.userId).toBe('user-001');
    });

    it('sets stabilityClass for communication_style to long_term', () => {
      const obs = builder.build(makeSignal({ taxonomyCategory: 'communication_style' }));
      expect(obs!.stabilityClass).toBe('long_term');
    });

    it('sets stabilityClass for professional_identity to permanent', () => {
      const obs = builder.build(makeSignal({ taxonomyCategory: 'professional_identity' }));
      expect(obs!.stabilityClass).toBe('permanent');
    });

    it('sets stabilityClass for goals_and_objectives to medium_term', () => {
      const obs = builder.build(makeSignal({ taxonomyCategory: 'goals_and_objectives' }));
      expect(obs!.stabilityClass).toBe('medium_term');
    });

    it('enforces ceiling for inferred source (sourceType=prompt)', () => {
      const signal = makeSignal({
        sourceType: 'prompt',
        rawContent: { sourceQuality: 'inferred' },
      });
      const obs = builder.build(signal);
      expect(obs!.confidence).toBeLessThanOrEqual(SOURCE_QUALITY_CEILING['inferred']);
    });

    it('enforces ceiling for explicit_statement (sourceType=explicit_statement)', () => {
      const signal = makeSignal({
        sourceType: 'explicit_statement',
        rawContent: { sourceQuality: 'explicit_statement' },
      });
      const obs = builder.build(signal);
      expect(obs!.confidence).toBeLessThanOrEqual(SOURCE_QUALITY_CEILING['explicit_statement']);
    });

    it('enforces ceiling for demonstrated_behavior', () => {
      const signal = makeSignal({
        sourceType: 'feedback_event',
        rawContent: { eventType: 'deployed', sourceQuality: 'demonstrated_behavior' },
      });
      const obs = builder.build(signal);
      expect(obs!.confidence).toBeLessThanOrEqual(SOURCE_QUALITY_CEILING['demonstrated_behavior']);
    });

    it('infers corroborating disposition for accepted event', () => {
      const signal = makeSignal({ rawContent: { eventType: 'accepted', sourceQuality: 'demonstrated_behavior' } });
      const obs = builder.build(signal);
      expect(obs!.disposition).toBe('corroborating');
    });

    it('infers contradicting disposition for rejected event', () => {
      const signal = makeSignal({ rawContent: { eventType: 'rejected', sourceQuality: 'demonstrated_behavior' } });
      const obs = builder.build(signal);
      expect(obs!.disposition).toBe('contradicting');
    });

    it('infers corroborating disposition for deployed event', () => {
      const signal = makeSignal({ rawContent: { eventType: 'deployed', sourceQuality: 'demonstrated_behavior' } });
      const obs = builder.build(signal);
      expect(obs!.disposition).toBe('corroborating');
    });

    it('forwards contextFlags to the observation', () => {
      const signal = makeSignal({ contextFlags: ['formal_context'] });
      const obs = builder.build(signal);
      expect(obs!.contextFlags).toContain('formal_context');
    });

    it('sets projectId from signal', () => {
      const signal = makeSignal({ projectId: 'proj-999' });
      const obs = builder.build(signal);
      expect(obs!.projectId).toBe('proj-999');
    });

    it('maps stakeholder_map category to relationship_intelligence domain', () => {
      const signal = makeSignal({ taxonomyCategory: 'stakeholder_map' });
      const obs = builder.build(signal);
      expect(obs!.domain).toBe('relationship_intelligence');
    });

    it('maps knowledge_assets to knowledge_intelligence domain', () => {
      const signal = makeSignal({ taxonomyCategory: 'knowledge_assets' });
      const obs = builder.build(signal);
      expect(obs!.domain).toBe('knowledge_intelligence');
    });

    it('defaults unmapped categories to user_intelligence domain', () => {
      const signal = makeSignal({ taxonomyCategory: 'communication_style' });
      const obs = builder.build(signal);
      expect(obs!.domain).toBe('user_intelligence');
    });
  });

  describe('applyCeiling', () => {
    it('caps inferred confidence to 0.35', () => {
      expect(builder.applyCeiling(0.9, 'inferred')).toBe(0.35);
    });

    it('caps demonstrated_behavior confidence to 0.90', () => {
      expect(builder.applyCeiling(0.99, 'demonstrated_behavior')).toBe(0.90);
    });

    it('does not reduce confidence below ceiling', () => {
      expect(builder.applyCeiling(0.2, 'explicit_statement')).toBe(0.2);
    });

    it('allows explicit_statement to reach 1.0', () => {
      expect(builder.applyCeiling(1.0, 'explicit_statement')).toBe(1.0);
    });
  });

  describe('stabilityClassFor', () => {
    it('returns permanent for operating_principles', () => {
      expect(builder.stabilityClassFor('operating_principles')).toBe('permanent');
    });

    it('returns long_term for expertise_domains', () => {
      expect(builder.stabilityClassFor('expertise_domains')).toBe('long_term');
    });

    it('returns medium_term for constraints_and_boundaries', () => {
      expect(builder.stabilityClassFor('constraints_and_boundaries')).toBe('medium_term');
    });
  });
});
