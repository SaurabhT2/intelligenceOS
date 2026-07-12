/**
 * IntelligenceSummary.ts
 *
 * The summary type returned by IntelligenceOS.getBrandSummary().
 *
 * This type will be promoted to the formal shared contract in Epic 2 when
 * it becomes part of the IIntelligenceProvider interface surface. For now
 * it lives in shared-intelligence-types so callers can import it from the
 * correct package without a breaking rename later.
 *
 * Source: Engineering Roadmap E1-3.
 * Source: Architecture Review E2-0 (type promoted early per E2-1 note).
 */

export interface IntelligenceSummary {
  /**
   * Composite confidence from the user's current intelligence profile (0–1).
   * Returns 0 when no profile exists (degraded=true).
   */
  compositeConfidence: number;

  /**
   * Primary archetype type string, e.g. 'founder', 'consultant'.
   * Null when no archetype has been assigned.
   */
  archetypePrimary: string | null;

  /**
   * Confidence in the primary archetype classification (0–1).
   * Null when archetypePrimary is null.
   */
  archetypeConfidence: number | null;

  /**
   * Count of learnings in active states: ACTIVE, CONFIRMED, VALIDATED.
   * DECAYING, FLAGGED, ARCHIVED, and RETIRED learnings are excluded.
   */
  activeLearningsCount: number;

  /**
   * Top 3 taxonomy category names by active-learning count, ordered descending.
   * Empty array when no active learnings exist.
   */
  topTaxonomyCategories: string[];

  /**
   * Voice summary from the user's current profile.
   * Null when no profile exists or the profile has no voice summary.
   */
  voiceSummary: Record<string, unknown> | null;

  /**
   * True when no intelligence profile exists for the user. In degraded mode,
   * compositeConfidence=0, archetypePrimary=null, activeLearningsCount=0.
   * Blueprint generation still succeeds but uses system defaults only.
   */
  degraded: boolean;
}
