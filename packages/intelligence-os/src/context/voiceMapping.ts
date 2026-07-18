/**
 * voiceMapping.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * Pure, side-effect-free projection functions: turn an array of already-
 * consolidated, workspace-scoped `Learning` records (produced by the
 * existing Learning Pipeline — SignalExtractor → HypothesisEngine →
 * LearningValidator, all reused unmodified) into the field values
 * `@platform/cognition-contract`'s `CognitionContext` needs.
 *
 * IMPORTANT — what this file is and is not:
 *   - It is NOT a second implementation of signal extraction, consolidation,
 *     or confidence calculation. Every `Learning` passed in has already been
 *     through the full pipeline (state ∈ {ACTIVE, CONFIRMED, VALIDATED},
 *     confidence already computed by LearningValidator/HypothesisEngine).
 *   - It IS new code, because nothing in Epic 2 previously needed to project
 *     `Learning[]` into the specific `VoiceProfile` / confidence-bucket shape
 *     `CognitionContext` requires — that projection is exactly the "Context
 *     Building" capability the Milestone 1 audit found genuinely missing.
 *   - `Learning.content` is an untyped `Record<string, unknown>` everywhere
 *     in Epic 2 (see NarrativePlanner's identical treatment of
 *     `profile.voiceSummary`) — there is no stricter schema to conform to.
 *     The field lookups below are a best-effort, defensively-typed mapping,
 *     not a claim that this is the one true shape voice-related learnings
 *     take. Flagged in the Milestone 2 report as a heuristic to revisit once
 *     a formal voice-learning content schema exists.
 */

import type { Learning, TaxonomyCategory } from '../types/entities';
import type {
  CognitionConfidence,
  VoiceProfile,
} from '@platform/cognition-contract';
import { mergeByAscendingConfidence } from './confidenceMerge';

// ── Which taxonomy categories carry voice-relevant content ────────────────

const VOICE_CATEGORIES: readonly TaxonomyCategory[] = [
  'communication_style',
  'writing_style',
];

// ── Defaults (mirror createDegradedCognitionContext in cognition-contract,
//    so a workspace with zero voice-relevant learnings degrades to exactly
//    the same shape BrandOS already falls back to on its own side) ────────

const DEFAULT_VOICE: VoiceProfile = {
  tone: 'professional',
  cadence: 'medium',
  audienceType: 'general',
  executiveLevel: false,
  domain: 'general',
  bannedPhrases: [],
};

function isCadence(v: unknown): v is VoiceProfile['cadence'] {
  return v === 'short' || v === 'medium' || v === 'long' || v === 'varied';
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const strs = v.filter((x): x is string => typeof x === 'string');
  return strs.length > 0 ? strs : undefined;
}

/**
 * Projects the subset of workspace learnings tagged as voice-relevant into
 * a `VoiceProfile`. Learnings are merged via the shared
 * `mergeByAscendingConfidence()` helper (ADR-005 finding D-2) — applied in
 * ascending confidence order so that, when multiple learnings disagree on
 * the same field, the highest-confidence learning's value wins (last
 * write wins). This mirrors — at the field-merge level only, not the
 * confidence-scoring level — the "higher confidence overrides lower
 * confidence" principle already used throughout the Learning Pipeline
 * (see LearningValidator's escalation rule).
 */
export function deriveVoiceProfile(learnings: readonly Learning[]): VoiceProfile {
  const relevant = learnings.filter(l => VOICE_CATEGORIES.includes(l.taxonomyCategory));

  const result = mergeByAscendingConfidence<
    Learning,
    {
      tone: string;
      cadence: VoiceProfile['cadence'];
      audienceType: string;
      executiveLevel: boolean;
      domain: string;
      bannedPhrases: readonly string[];
      brandName: string;
      voiceDescriptor: string;
      audiencePositioning: string;
    }
  >(relevant, (learning) => {
    const c = learning.content;
    const fields: Partial<{
      tone: string;
      cadence: VoiceProfile['cadence'];
      audienceType: string;
      executiveLevel: boolean;
      domain: string;
      bannedPhrases: readonly string[];
      brandName: string;
      voiceDescriptor: string;
      audiencePositioning: string;
    }> = {};

    const tone = asString(c['tone']);
    if (tone) fields.tone = tone;

    const cadence = c['cadence'];
    if (isCadence(cadence)) fields.cadence = cadence;

    const audienceType = asString(c['audienceType']);
    if (audienceType) fields.audienceType = audienceType;

    const executiveLevel = asBool(c['executiveLevel']);
    if (executiveLevel !== undefined) fields.executiveLevel = executiveLevel;

    const domain = asString(c['domain']);
    if (domain) fields.domain = domain;

    const bannedPhrases = asStringArray(c['bannedPhrases']);
    if (bannedPhrases) fields.bannedPhrases = bannedPhrases;

    const brandName = asString(c['brandName']);
    if (brandName) fields.brandName = brandName;

    const voiceDescriptor = asString(c['voiceDescriptor']);
    if (voiceDescriptor) fields.voiceDescriptor = voiceDescriptor;

    const audiencePositioning = asString(c['audiencePositioning']);
    if (audiencePositioning) fields.audiencePositioning = audiencePositioning;

    return fields;
  });

  return {
    tone: result.tone ?? DEFAULT_VOICE.tone,
    cadence: result.cadence ?? DEFAULT_VOICE.cadence,
    audienceType: result.audienceType ?? DEFAULT_VOICE.audienceType,
    executiveLevel: result.executiveLevel ?? DEFAULT_VOICE.executiveLevel,
    domain: result.domain ?? DEFAULT_VOICE.domain,
    bannedPhrases: result.bannedPhrases ?? DEFAULT_VOICE.bannedPhrases,
    ...(result.brandName ? { brandName: result.brandName } : {}),
    ...(result.voiceDescriptor ? { voiceDescriptor: result.voiceDescriptor } : {}),
    ...(result.audiencePositioning ? { audiencePositioning: result.audiencePositioning } : {}),
  };
}

/**
 * Buckets a set of already-computed per-learning confidence scores into the
 * single, coarse `CognitionConfidence` value the contract permits. This is
 * new code (no equivalent bucketing existed anywhere in Epic 2 before this
 * milestone), but it performs no confidence *calculation* of its own — every
 * input number was already produced by LearningValidator/HypothesisEngine.
 * It only decides which of four buckets an already-final average falls into.
 *
 * Thresholds are a first-pass heuristic (documented as such in the
 * Milestone 2 report), not derived from any architecture document — none of
 * the three specify bucket boundaries.
 */
export function deriveConfidence(learnings: readonly Learning[]): CognitionConfidence {
  if (learnings.length === 0) return 'degraded';

  const avg =
    learnings.reduce((sum, l) => sum + l.confidence, 0) / learnings.length;

  if (avg >= 0.75) return 'high';
  if (avg >= 0.5) return 'medium';
  return 'low';
}

/** Most recent `updatedAt` across a set of learnings, or null if empty. */
export function deriveLastConsolidatedAt(learnings: readonly Learning[]): string | null {
  if (learnings.length === 0) return null;
  const latest = learnings.reduce((max, l) =>
    l.updatedAt.getTime() > max.getTime() ? l.updatedAt : max,
    learnings[0]!.updatedAt,
  );
  return latest.toISOString();
}
