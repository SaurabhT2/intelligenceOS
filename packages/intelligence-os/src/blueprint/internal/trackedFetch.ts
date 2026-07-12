/**
 * trackedFetch.ts
 *
 * Shared helper for the Blueprint Pipeline's fail-soft fetch pattern.
 *
 * Every Step-1 intelligence fetch in BlueprintBuilder (and its helpers,
 * ProjectContextBuilder and AudienceCalibrator) is wrapped in
 * `.catch(() => fallback)` so a single failing data source never aborts
 * blueprint assembly. Until Epic 2 that catch silently discarded the fact
 * that it had fired at all. `trackedCatch` preserves the exact same
 * fail-soft behaviour while also reporting whether the fallback was
 * actually used — which is what ArtifactBlueprint.degraded (E2-1-T1) is
 * built from.
 *
 * Rule this helper exists to enforce: a "degraded" signal means "an
 * intelligence source errored and we fell back," never "this data
 * legitimately doesn't exist yet." A brand-new user with no stored profile
 * is not degraded; a profile fetch that throws and is caught is.
 */

export interface TrackedResult<T> {
  value: T;
  failed: boolean;
}

export async function trackedCatch<T>(
  promise: Promise<T>,
  fallback: T,
): Promise<TrackedResult<T>> {
  try {
    return { value: await promise, failed: false };
  } catch {
    return { value: fallback, failed: true };
  }
}

/** Convenience for branches that skip the fetch entirely (e.g. no id provided)
 *  and therefore never degrade — there was nothing to fail. */
export function skipped<T>(value: T): Promise<TrackedResult<T>> {
  return Promise.resolve({ value, failed: false });
}
