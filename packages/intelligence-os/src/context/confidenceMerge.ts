/**
 * confidenceMerge.ts
 *
 * ADR-005 (Architecture Governance Synthesis) finding D-2 (Compliance
 * Audit, ADR-003 session): `identitySynthesis.ts` and `voiceMapping.ts`
 * each independently implemented the exact same merge rule — sort a set
 * of confidence-scored items ascending by confidence, then assign each
 * item's fields in order so a later (higher-confidence) item's value
 * overwrites an earlier (lower-confidence) one on conflict. No runtime
 * disagreement ever existed between the two copies (the rule itself was
 * already fully decided), but duplicating it was pure, unnecessary
 * repetition. This module is the one shared implementation both now call.
 *
 * ── What this deliberately does NOT also absorb ─────────────────────────
 * ADR-005 named a third location, `NarrativePlanner.ts`'s voice/vocabulary
 * composition, as part of the same finding. On inspection, that code is
 * not the same algorithm: it resolves each field through an explicit,
 * named authority chain (workspace brand > user > archetype > audience
 * default), with array-valued fields (tone, avoidPatterns) *unioned*
 * across levels rather than fully overwritten, and internally-computed
 * "workspace voice/vocabulary" intermediate objects rather than a flat
 * list of confidence-scored items sorted and folded. Forcing that into
 * this module's shape would mean rewriting genuinely different,
 * already-correct, already-tested logic for cosmetic uniformity rather
 * than real deduplication — the opposite of what this finding asked for
 * ("pure code deduplication... no new decision"). It is intentionally left
 * as-is; see its own docblock for its real merge rule.
 *
 * `buildSynthesizedCollection()` (`pipeline/ProfileBuilder.ts`, ADR-004
 * §4) is also a distinct algorithm, not a candidate for this module: it
 * builds a *union* of deduplicated items across two sources (Knowledge and
 * Experience), not a single overwritten value — see that function's own
 * docblock and `ADR-004`'s Consequences section for why that asymmetry
 * with this module's shape is accepted rather than retrofitted.
 */

/**
 * Sorts `items` ascending by `confidence`, then folds each item's
 * extracted fields into a single result object in that order — a later
 * (higher-confidence) item's defined field values overwrite an earlier
 * (lower-confidence) item's on conflict; `undefined` values never
 * overwrite anything already set. This is a pure, allocation-only
 * function: `items` is never mutated (sorted on a copy).
 *
 * @param items          Confidence-scored items to merge (e.g. `Learning[]`).
 * @param extractFields  Projects one item into the (possibly partial) set
 *                       of result fields it contributes. Returning a field
 *                       as `undefined` means "this item has no opinion on
 *                       this field" — it is skipped, not written as
 *                       `undefined`.
 */
export function mergeByAscendingConfidence<T extends { confidence: number }, R extends object>(
  items: readonly T[],
  extractFields: (item: T) => Partial<R>,
): Partial<R> {
  const sorted = items.slice().sort((a, b) => a.confidence - b.confidence);

  const result: Partial<R> = {};
  for (const item of sorted) {
    const fields = extractFields(item);
    for (const key of Object.keys(fields) as (keyof R)[]) {
      const value = fields[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}
