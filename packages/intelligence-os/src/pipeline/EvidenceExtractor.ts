/**
 * EvidenceExtractor.ts
 *
 * Stage 1 of the Learning Pipeline — Evidence/Identity Bridge (ADR-005).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Knowledge ingestion (KnowledgeProcessor) already extracts frameworks and
 * vocabulary with taxonomy classification attached (VocabularyExtractor's
 * mapToTaxonomy, FrameworkExtractor's category field) and writes them
 * straight into KnowledgeAsset / the Profile's descriptive
 * knowledgeSummary/vocabularySnapshot fields. None of that ever became
 * *evidence* — nothing converted it into a Signal, so it could never
 * corroborate a Hypothesis or promote to a Learning, and identity
 * synthesis (identitySynthesis.ts) — which reads only promoted Learnings —
 * had nothing to read from Knowledge, ever, regardless of how many
 * documents were uploaded.
 *
 * This module is Stage 1 for that missing path — the same role
 * SignalExtractor already plays for feedback events and workspace
 * observations, generalized to a source-agnostic evidence envelope rather
 * than one written around "uploaded documents" specifically.
 *
 * ── Source-agnostic by design ──────────────────────────────────────────────
 * A first design draft of this module (`KnowledgeEvidenceExtractor`) took a
 * KnowledgeAsset's extraction results directly as input. That was rejected
 * in review: it would have hard-coded "evidence == uploaded document" into
 * the Stage 1 contract, requiring a second, parallel Stage 1 (and likely a
 * second Stage-2-through-6 wiring) the day a connector, web import,
 * repository, or conversation source is added.
 *
 * Instead, `EvidenceExtractor` consumes `EvidenceSourceInput` — a generic
 * envelope any producer can build. Today there is exactly one producer,
 * `knowledge/KnowledgeAssetEvidenceAdapter.ts`, which is the ONLY
 * Knowledge-specific file in this bridge; everything below it (this file,
 * ObservationBuilder, HypothesisEngine, LearningValidator, ProfileBuilder,
 * identitySynthesis) is unchanged by, and has no awareness of, where the
 * evidence originated. A future connector/web-import/repository/
 * conversation producer is a new adapter file plus one new
 * `EvidenceSourceKind` value (types/entities.ts) — no change here.
 *
 * ── What "evidence" means here (quality gate) ──────────────────────────────
 * A candidate becomes a Signal only if it clears a source-agnostic honesty
 * gate: `confidence >= MIN_CANDIDATE_CONFIDENCE` AND (at least
 * `MIN_SUPPORTING_ITEMS` distinct supporting items, OR confidence at least
 * `HIGH_CONFIDENCE_SINGLE_ITEM_THRESHOLD`). This rejects a single
 * incidental keyword match while still allowing a single very-high-
 * confidence declaration through (e.g. a future connector surfacing an
 * explicit "About Us" positioning statement) — the gate is about evidence
 * quality, not about how many documents were involved.
 *
 * This is a *filter*, not a promotion decision — every Signal that passes
 * it still goes through the full, unmodified Observation → Hypothesis →
 * Learning gate (ObservationBuilder ceiling, HypothesisEngine corroboration
 * counting, LearningValidator threshold/escalation). A single passing
 * Signal from a single document therefore still cannot promote a Learning
 * on its own except in the rare cases the *existing*, unmodified escalation
 * rule already allows for any source (3+ corroborations, 0 contradictions)
 * — this module creates no new fast path.
 *
 * Source: ADR-005 (Knowledge → Evidence → Hypothesis → Learning → Identity Bridge).
 */

import type { Signal, TaxonomyCategory, EvidenceRecord, EvidenceSourceKind } from '../types/entities';
import type { SubjectRef } from '../types/subject';
import type { SignalSourceType } from '../types/entities';

// ── Evidence-quality gate ──────────────────────────────────────────────────────

const MIN_CANDIDATE_CONFIDENCE = 0.5;
const MIN_SUPPORTING_ITEMS = 2;
const HIGH_CONFIDENCE_SINGLE_ITEM_THRESHOLD = 0.75;

// ── Source-kind → Signal-source-type mapping ───────────────────────────────────
// Every EvidenceSourceKind maps to the SignalSourceType ObservationBuilder
// already knows how to classify (classifySourceQuality). Adding a new
// EvidenceSourceKind requires one new line here, nothing else in Stage 2+.

const SOURCE_KIND_TO_SIGNAL_TYPE: Record<EvidenceSourceKind, SignalSourceType> = {
  knowledge_asset: 'uploaded_artifact',
  connector:        'uploaded_artifact',
  web_import:       'uploaded_artifact',
  repository:       'uploaded_artifact',
  conversation:     'prompt',
  experience:       'behavioral',
};

// ── EvidenceCandidate / EvidenceSourceInput ────────────────────────────────────

/**
 * One candidate piece of evidence for a single taxonomy category, already
 * classified by the producing adapter (e.g. VocabularyExtractor's
 * mapToTaxonomy / FrameworkExtractor's category, for the Knowledge
 * producer). `identityContent`, when present, is merged verbatim into the
 * resulting Signal/Observation/Hypothesis `content`/`proposition` — this is
 * how category-specific fields `identitySynthesis.ts` reads
 * (`namedFrameworks`, `brandName`, `argumentationStyle`, `preferredLength`)
 * get populated, without EvidenceExtractor itself needing to know what a
 * "framework" or a "vocabulary term" is.
 */
export interface EvidenceCandidate {
  taxonomyCategory: TaxonomyCategory;
  /** Confidence already assigned by the producing extractor (0–1), before any SOURCE_QUALITY_CEILING is applied — ObservationBuilder applies that ceiling downstream, as it does for every other source. */
  confidence: number;
  /** Concrete items that back this candidate — framework names, vocabulary terms/phrases, etc. Always non-empty. */
  supportingItems: string[];
  /** Category-specific fields for identity/knowledge synthesis (e.g. `{ namedFrameworks: [...] }`). Optional — omitted candidates still corroborate, just without contributing extra structured fields. */
  identityContent?: Record<string, unknown>;
}

/**
 * The generic envelope any evidence producer builds. `EvidenceExtractor`
 * has no knowledge of what's on the other side of this — a KnowledgeAsset
 * today, potentially a connector sync record or a repository commit
 * tomorrow.
 */
export interface EvidenceSourceInput {
  sourceKind: EvidenceSourceKind;
  sourceId: string;
  sourceLabel?: string;
  subject: SubjectRef;
  projectId: string | null;
  observedAt: string;
  candidates: EvidenceCandidate[];
}

// ── EvidenceExtractor ─────────────────────────────────────────────────────────

export class EvidenceExtractor {
  /**
   * Converts a source-agnostic `EvidenceSourceInput` into zero or more
   * in-memory `Signal` records, applying the evidence-quality gate above.
   * Mirrors `SignalExtractor.extractFromFeedback`/`extractFromObservation`'s
   * role and return shape exactly, so it slots into the same Stage 2
   * (`ObservationBuilder.build`) unmodified.
   */
  extract(input: EvidenceSourceInput): Signal[] {
    const signalSourceType = SOURCE_KIND_TO_SIGNAL_TYPE[input.sourceKind];
    const signals: Signal[] = [];

    for (const candidate of input.candidates) {
      if (!passesEvidenceGate(candidate)) continue;

      const provenance: EvidenceRecord = {
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        sourceLabel: input.sourceLabel,
        taxonomyCategory: candidate.taxonomyCategory,
        supportingItems: candidate.supportingItems,
        confidence: candidate.confidence,
        disposition: 'new', // resolved properly by ObservationBuilder.inferDisposition; evidence signals are always corroborating-by-presence, never a contradiction signal today (no producer emits negative evidence yet)
        observedAt: input.observedAt,
      };

      const subjectType = input.subject.subjectType;

      signals.push({
        id: generateId(),
        userId: subjectType === 'user' ? input.subject.subjectId : null,
        workspaceId: subjectType === 'workspace' ? input.subject.subjectId : null,
        subjectType,
        projectId: input.projectId,
        sourceType: signalSourceType,
        sourceRef: input.sourceId,
        contextFlags: [],
        taxonomyCategory: candidate.taxonomyCategory,
        rawContent: {
          primaryCategory: candidate.taxonomyCategory,
          sourceQuality: signalSourceType, // classifySourceQuality re-derives this from sourceType; kept for parity with other extractors' rawContent shape
          supportingItems: candidate.supportingItems,
          ...candidate.identityContent,
          provenance,
        },
        isQuarantined: false,
        quarantineReason: null,
        processedAt: null,
        createdAt: new Date(input.observedAt),
      });
    }

    return signals;
  }
}

function passesEvidenceGate(candidate: EvidenceCandidate): boolean {
  if (candidate.confidence < MIN_CANDIDATE_CONFIDENCE) return false;
  if (candidate.supportingItems.length === 0) return false;
  if (candidate.supportingItems.length >= MIN_SUPPORTING_ITEMS) return true;
  return candidate.confidence >= HIGH_CONFIDENCE_SINGLE_ITEM_THRESHOLD;
}

function generateId(): string {
  return crypto.randomUUID();
}
