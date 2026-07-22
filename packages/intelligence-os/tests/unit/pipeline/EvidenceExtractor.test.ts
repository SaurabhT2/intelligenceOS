/**
 * EvidenceExtractor.test.ts
 *
 * Evidence/Identity Bridge (ADR-005) — Stage 1 unit tests.
 *
 * Covers the evidence-quality gate (MIN_CANDIDATE_CONFIDENCE,
 * MIN_SUPPORTING_ITEMS, HIGH_CONFIDENCE_SINGLE_ITEM_THRESHOLD) and the
 * resulting Signal shape, independent of any particular evidence source —
 * these tests never construct a KnowledgeAsset, deliberately, to keep this
 * file proving the extractor really is source-agnostic.
 */

import { describe, it, expect } from 'vitest';
import { EvidenceExtractor, type EvidenceSourceInput } from '../../../src/pipeline/EvidenceExtractor';
import { userSubject, workspaceSubject } from '../../../src/types/subject';

function baseInput(overrides: Partial<EvidenceSourceInput> = {}): EvidenceSourceInput {
  return {
    sourceKind: 'knowledge_asset',
    sourceId: 'src-1',
    sourceLabel: 'Some Source',
    subject: workspaceSubject('ws-1'),
    projectId: null,
    observedAt: new Date().toISOString(),
    candidates: [],
    ...overrides,
  };
}

describe('EvidenceExtractor — evidence-quality gate', () => {
  it('rejects a candidate below MIN_CANDIDATE_CONFIDENCE regardless of supporting items', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      candidates: [{
        taxonomyCategory: 'intellectual_frameworks',
        confidence: 0.3,
        supportingItems: ['Framework A', 'Framework B', 'Framework C'],
      }],
    }));
    expect(signals).toHaveLength(0);
  });

  it('rejects a single supporting item at moderate confidence (noise, not evidence)', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      candidates: [{
        taxonomyCategory: 'professional_identity',
        confidence: 0.6,
        supportingItems: ['founder'],
      }],
    }));
    expect(signals).toHaveLength(0);
  });

  it('accepts a single supporting item when confidence clears the high-confidence threshold', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      candidates: [{
        taxonomyCategory: 'personal_brand_signal',
        confidence: 0.9,
        supportingItems: ['Explicit "About Us" positioning statement'],
      }],
    }));
    expect(signals).toHaveLength(1);
  });

  it('accepts two or more supporting items at the minimum confidence floor', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      candidates: [{
        taxonomyCategory: 'intellectual_frameworks',
        confidence: 0.5,
        supportingItems: ['Framework A', 'Framework B'],
      }],
    }));
    expect(signals).toHaveLength(1);
  });

  it('rejects a candidate with zero supporting items even at high confidence', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      candidates: [{
        taxonomyCategory: 'intellectual_frameworks',
        confidence: 0.95,
        supportingItems: [],
      }],
    }));
    expect(signals).toHaveLength(0);
  });

  it('evaluates each candidate independently — one passing, one failing', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      candidates: [
        { taxonomyCategory: 'intellectual_frameworks', confidence: 0.8, supportingItems: ['Framework A', 'Framework B'] },
        { taxonomyCategory: 'strategic_thinking_patterns', confidence: 0.4, supportingItems: ['keyword'] },
      ],
    }));
    expect(signals).toHaveLength(1);
    expect(signals[0]!.taxonomyCategory).toBe('intellectual_frameworks');
  });
});

describe('EvidenceExtractor — Signal shape', () => {
  it('produces a Signal carrying full provenance for explainability', () => {
    const extractor = new EvidenceExtractor();
    const observedAt = new Date().toISOString();
    const signals = extractor.extract(baseInput({
      sourceId: 'asset-42',
      sourceLabel: 'Q3 Playbook.pdf',
      observedAt,
      candidates: [{
        taxonomyCategory: 'intellectual_frameworks',
        confidence: 0.8,
        supportingItems: ['JTBD Framework', 'Value Ladder'],
        identityContent: { namedFrameworks: ['JTBD Framework', 'Value Ladder'] },
      }],
    }));

    expect(signals).toHaveLength(1);
    const signal = signals[0]!;
    expect(signal.sourceType).toBe('uploaded_artifact');
    expect(signal.sourceRef).toBe('asset-42');
    expect(signal.taxonomyCategory).toBe('intellectual_frameworks');
    expect(signal.rawContent['namedFrameworks']).toEqual(['JTBD Framework', 'Value Ladder']);

    const provenance = signal.rawContent['provenance'] as Record<string, unknown>;
    expect(provenance).toMatchObject({
      sourceKind: 'knowledge_asset',
      sourceId: 'asset-42',
      sourceLabel: 'Q3 Playbook.pdf',
      taxonomyCategory: 'intellectual_frameworks',
      supportingItems: ['JTBD Framework', 'Value Ladder'],
      confidence: 0.8,
      observedAt,
    });
  });

  it('assigns userId for a user-subject envelope and workspaceId for a workspace-subject envelope', () => {
    const extractor = new EvidenceExtractor();

    const userSignals = extractor.extract(baseInput({
      subject: userSubject('user-1'),
      candidates: [{ taxonomyCategory: 'intellectual_frameworks', confidence: 0.8, supportingItems: ['A', 'B'] }],
    }));
    expect(userSignals[0]!.userId).toBe('user-1');
    expect(userSignals[0]!.workspaceId).toBeNull();
    expect(userSignals[0]!.subjectType).toBe('user');

    const workspaceSignals = extractor.extract(baseInput({
      subject: workspaceSubject('ws-1'),
      candidates: [{ taxonomyCategory: 'intellectual_frameworks', confidence: 0.8, supportingItems: ['A', 'B'] }],
    }));
    expect(workspaceSignals[0]!.workspaceId).toBe('ws-1');
    expect(workspaceSignals[0]!.userId).toBeNull();
    expect(workspaceSignals[0]!.subjectType).toBe('workspace');
  });

  it('maps a "conversation" source kind to the prompt SignalSourceType', () => {
    const extractor = new EvidenceExtractor();
    const signals = extractor.extract(baseInput({
      sourceKind: 'conversation',
      candidates: [{ taxonomyCategory: 'intellectual_frameworks', confidence: 0.8, supportingItems: ['A', 'B'] }],
    }));
    expect(signals[0]!.sourceType).toBe('prompt');
  });

  it('returns an empty array (not an error) for an envelope with no candidates', () => {
    const extractor = new EvidenceExtractor();
    expect(extractor.extract(baseInput({ candidates: [] }))).toEqual([]);
  });
});
