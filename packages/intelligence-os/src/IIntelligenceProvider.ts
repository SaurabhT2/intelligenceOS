/**
 * IIntelligenceProvider.ts
 *
 * The platform's public provider contract — Epic 2 (Platform Publication),
 * E2-2.
 *
 * ── Where this came from, and why it changed shape ─────────────────────────
 *
 * The original Engineering Roadmap (E2-2) specified this interface living in
 * a BrandOS-owned package (`@brandos/contracts`), authored by the BrandOS
 * team, so BrandOS's own CPL orchestrator could depend on an interface
 * rather than a concrete class and swap between `IntelligenceOSProvider`
 * (this package) and `BrandOSLegacyIntelligenceProvider` (BrandOS's old
 * in-house intelligence code) behind a feature flag.
 *
 * The Stage Gate Review reframed Epic 2 as platform publication rather than
 * BrandOS integration, with a hard rule: never require another
 * application's source code, and expose everything necessary through this
 * platform's own public interfaces, contracts, DTOs, and adapters. A
 * provider interface that only existed inside a consumer's private package
 * would fail that rule immediately — no other application could depend on
 * it without first depending on BrandOS. So this interface now lives here,
 * in `@intelligence-os/core`'s own public surface, authored and owned by
 * the platform. Any consumer (BrandOS or otherwise) imports it from here.
 * `IntelligenceOSProvider` (see ./compat/IntelligenceOSProvider.ts) is the
 * platform's own implementation; a consumer is free to write its own
 * (e.g. a legacy wrapper, a test double) against this same interface.
 *
 * ── What's intentionally NOT part of this interface ─────────────────────────
 *
 * `IntelligenceOS.eventBus` is deliberately excluded. Pipeline-event
 * observability is an additional capability a real implementation may
 * offer, not a structural requirement every provider must satisfy — a
 * legacy-wrapper implementation may have no meaningful event bus to expose.
 * Consumers that need it can depend on the concrete `IntelligenceOS` class
 * (or feature-detect a `.eventBus` property) rather than this interface.
 *
 * ── Stability note ──────────────────────────────────────────────────────────
 *
 * This interface is the platform's most consumer-facing contract. Treat any
 * change to its method signatures as a breaking change requiring a major
 * (or, pre-1.0, a minor) version bump and a CHANGELOG entry — see
 * docs/IMPLEMENTATION_STATUS.md, "Versioning policy."
 */

import type {
  ArtifactRequest,
  ArtifactBlueprint,
  FeedbackEvent,
  IntelligenceSummary,
} from '@intelligence-os/shared-types';
import type { ProjectInput, KnowledgeAssetInput } from './types/domains';

export interface IIntelligenceProvider {
  /**
   * Called before artifact generation. Always resolves to a complete
   * blueprint, even for a brand-new user with no stored intelligence —
   * never throws for that reason. See ArtifactBlueprint.degraded for how
   * to distinguish "used defaults because nothing exists yet" from
   * "a fetch genuinely failed and we covered for it."
   */
  buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint>;

  /**
   * Called after artifact delivery/publish. Persists the feedback event
   * and triggers asynchronous learning-pipeline processing. Returns once
   * the event is durably recorded; pipeline processing itself is fire-
   * and-forget from the caller's perspective.
   */
  recordFeedbackEvent(event: FeedbackEvent): Promise<void>;

  /**
   * Called at onboarding or whenever a knowledge asset is uploaded.
   * Returns the persisted asset id.
   */
  ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent?: string): Promise<string>;

  /**
   * Called when a consumer-side project is created or updated. Idempotent —
   * safe to call on every sync. Returns the platform-side project id.
   */
  upsertProject(input: ProjectInput): Promise<string>;

  /**
   * Supervisory review of a machine-proposed, FLAGGED learning. Transitions
   * it to ACTIVE (approved) or ARCHIVED (rejected).
   */
  reviewLearning(
    userId: string,
    learningId: string,
    approved: boolean,
    reviewedBy: string,
  ): Promise<void>;

  /**
   * Returns a summary of the intelligence available for a user (and
   * optionally a workspace). Always succeeds — returns a degraded summary
   * when no profile exists rather than throwing.
   */
  getBrandSummary(params: { userId: string; workspaceId?: string }): Promise<IntelligenceSummary>;
}
