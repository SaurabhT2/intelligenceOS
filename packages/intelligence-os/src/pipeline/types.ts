/**
 * pipeline/types.ts
 *
 * Internal types for the Sprint 2 Learning Pipeline.
 *
 * `Observation` is pipeline-internal and transient per entities.ts, which
 * explicitly deferred it to Sprint 2 with the note:
 *   "Nothing in Sprint 0 constructs or consumes one, so it's intentionally
 *    omitted rather than guessed at."
 *
 * Source: BrandOS Logical Intelligence Schema D.1 (Stage 2), D.3.
 * Source: BrandOS Intelligence Contracts B.2.
 */

import type { TaxonomyCategory, StabilityClass } from '../types/entities';
import type { DomainType } from '../types/domains';

// ── Source quality (maps to confidence ceiling) ────────────────────────────────
// Schema D.3 Ceiling Rule:
//   inferred       → Low ceiling    (≤ 0.35)
//   stated         → Medium ceiling (≤ 0.65)
//   uploaded       → High ceiling   (≤ 0.90)
//   explicit_statement → ceiling ≤ 1.0 (highest)
// Contracts B.2 Signal → Observation: source quality is classified from source_type.

export type SourceQuality =
  | 'explicit_statement'   // User directly stated a preference/fact — ceiling: 1.0
  | 'demonstrated_behavior' // Inferred from consistent behavioral pattern — ceiling: 0.90
  | 'uploaded_artifact'    // Extracted from uploaded document — ceiling: 0.90
  | 'inferred';            // Single-signal inference — ceiling: 0.35

export const SOURCE_QUALITY_CEILING: Record<SourceQuality, number> = {
  explicit_statement:    1.00,
  demonstrated_behavior: 0.90,
  uploaded_artifact:     0.90,
  inferred:              0.35,
};

// ── Observation ────────────────────────────────────────────────────────────────
// Pipeline-internal, transient — not persisted to its own table.
// Produced by ObservationBuilder, consumed immediately by HypothesisEngine.

export interface Observation {
  /** Derived from the source Signal's id. */
  signalId: string;
  userId: string;
  projectId: string | null;
  taxonomyCategory: TaxonomyCategory;
  stabilityClass: StabilityClass;
  domain: DomainType;
  sourceQuality: SourceQuality;
  /** Confidence, capped at SOURCE_QUALITY_CEILING[sourceQuality]. */
  confidence: number;
  /** Whether this observation corroborates (+1) or contradicts (−1) an existing hypothesis. */
  disposition: 'corroborating' | 'contradicting' | 'new';
  content: Record<string, unknown>;
  /** Context flags forwarded from the source Signal. */
  contextFlags: string[];
  createdAt: Date;
}

// ── Pipeline stage results ─────────────────────────────────────────────────────

export interface PipelineRunResult {
  userId: string;
  signalsProcessed: number;
  observationsCreated: number;
  hypothesesUpdated: number;
  learningsCreated: number;
  profileRebuilt: boolean;
  errors: PipelineStageError[];
}

export interface PipelineStageError {
  stage: 'signal' | 'observation' | 'hypothesis' | 'learning' | 'profile';
  message: string;
  cause?: unknown;
}
