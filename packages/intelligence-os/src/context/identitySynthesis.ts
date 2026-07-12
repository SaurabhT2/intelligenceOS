/**
 * identitySynthesis.ts
 *
 * ADR-003 (Subject-Centric Intelligence) §2.3 — gives `context/ContextBuilder.ts`
 * a real identity-synthesis path for the Workspace subject, replacing the
 * unconditional `identity: null` Milestone 2 shipped (see
 * `ContextBuilder.ts`'s former "Consequence, stated plainly" note, now
 * corrected).
 *
 * ── Why this lives next to voiceMapping.ts rather than inside it ───────────
 * `voiceMapping.ts`'s `deriveVoiceProfile()` already establishes the exact
 * pattern this module reuses: project a `Learning[]` slice into one
 * contract-shaped value, applied in ascending-confidence order so a
 * higher-confidence Learning's field value overrides a lower-confidence
 * one on conflict — the same "higher confidence wins" precedence
 * `LearningValidator`'s own escalation rule already uses, applied here at
 * the field-merge level. `NarrativePlanner`'s authority-ordered
 * composition (`blueprint/NarrativePlanner.ts`, `ARCHITECTURE.md` §10) is
 * the other reference point ADR-003 names explicitly: workspace-declared
 * facts outrank inferred ones. This module is a separate file rather than
 * an addition to `voiceMapping.ts` because it projects a genuinely
 * different section of the contract (`identity`, not `voice`) from a
 * different, non-overlapping set of taxonomy categories — the same
 * one-file-per-contract-section shape `voiceMapping.ts` already
 * established, not a new convention.
 *
 * ── Scope, stated plainly ───────────────────────────────────────────────────
 * `CognitionRequest` still carries no `userId` (unchanged by ADR-003 — see
 * `PLATFORM_CONTRACT.md` §5's evolution rules and ADR-003 §4's own
 * "Alternatives Considered": widening the contract was explicitly
 * rejected). A Workspace's synthesized identity is therefore derived
 * *only* from the Workspace's own Learnings — never from a contributing
 * User's profile, because this builder has no honest way to know which
 * User, if any, that would be. Returns `null` when the Workspace has no
 * identity-relevant Learnings yet — the same honest "nothing learned yet"
 * value Milestone 2 always returned, now conditional on there genuinely
 * being nothing to report rather than unconditional.
 */

import type { Learning, TaxonomyCategory } from '../types/entities';
import type { IdentityContribution } from '@platform/cognition-contract';

// ── Which taxonomy categories carry identity-relevant content ──────────────
// Deliberately narrower than VOICE_CATEGORIES (voiceMapping.ts) — identity is
// about stable structural/argumentative facts, not tone/cadence.

const IDENTITY_CATEGORIES: readonly TaxonomyCategory[] = [
  'intellectual_frameworks',
  'strategic_thinking_patterns',
  'professional_identity',
  'personal_brand_signal',
];

// A Learning below this confidence hasn't earned a place in a synthesized
// identity yet — mirrors the "pre-gated by confidence" expectation
// `CognitionContext.identity`'s own doc comment states, and the same
// discipline `deriveConfidence` (voiceMapping.ts) applies at the
// context-wide level, applied here per-field instead.
const MIN_IDENTITY_CONFIDENCE = 0.5;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const strs = v.filter((x): x is string => typeof x === 'string');
  return strs.length > 0 ? strs : undefined;
}

/**
 * Projects a Subject's identity-relevant Learnings into an
 * `IdentityContribution`, or `null` if none exist yet. Field-merge
 * precedence: ascending confidence order, so the highest-confidence
 * Learning touching a given field wins — identical merge discipline to
 * `voiceMapping.ts`'s `deriveVoiceProfile()`.
 */
export function deriveIdentityContribution(learnings: readonly Learning[]): IdentityContribution | null {
  const relevant = learnings
    .filter(l => IDENTITY_CATEGORIES.includes(l.taxonomyCategory) && l.confidence >= MIN_IDENTITY_CONFIDENCE)
    .slice()
    .sort((a, b) => a.confidence - b.confidence);

  if (relevant.length === 0) return null;

  const result: {
    brandName?: string;
    narrativeArcs?: string[];
    argumentationStyle?: string;
    namedFrameworks?: string[];
    preferredLength?: IdentityContribution['preferredLength'];
  } = {};

  for (const learning of relevant) {
    const c = learning.content;

    const brandName = asString(c['brandName']);
    if (brandName) result.brandName = brandName;

    const narrativeArcs = asStringArray(c['narrativeArcs']);
    if (narrativeArcs) result.narrativeArcs = narrativeArcs;

    const argumentationStyle = asString(c['argumentationStyle']);
    if (argumentationStyle) result.argumentationStyle = argumentationStyle;

    // 'intellectual_frameworks' Learnings may declare either a single
    // `framework`/`name` field or an already-plural `frameworks` array —
    // both are honored without inventing a name neither carries.
    const namedFrameworks =
      asStringArray(c['namedFrameworks']) ??
      asStringArray(c['frameworks']) ??
      (asString(c['framework']) ? [asString(c['framework'])!] : undefined) ??
      (asString(c['name']) ? [asString(c['name'])!] : undefined);
    if (namedFrameworks) result.namedFrameworks = namedFrameworks;

    const preferredLength = c['preferredLength'];
    if (preferredLength === 'short' || preferredLength === 'medium' || preferredLength === 'long') {
      result.preferredLength = preferredLength;
    }
  }

  // Nothing in the relevant, confidence-gated set actually populated a
  // field (e.g. every matching Learning's content used field names this
  // projection doesn't recognize) — honest null rather than an
  // all-undefined shell.
  if (
    result.brandName === undefined &&
    result.narrativeArcs === undefined &&
    result.argumentationStyle === undefined &&
    result.namedFrameworks === undefined &&
    result.preferredLength === undefined
  ) {
    return null;
  }

  return {
    brandName: result.brandName ?? null,
    narrativeArcs: result.narrativeArcs ?? [],
    argumentationStyle: result.argumentationStyle ?? null,
    namedFrameworks: result.namedFrameworks ?? [],
    preferredLength: result.preferredLength ?? 'medium',
  };
}
