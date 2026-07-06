/**
 * CognitionProviderImpl.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * IntelligenceOS's implementation of `CognitionProvider`
 * (`@platform/cognition-contract`) — the interface BrandOS's
 * `HttpCognitionProvider` already calls. Per
 * `INTELLIGENCE_PLATFORM_IMPLEMENTATION.md` §3, `api/` is the only module
 * IntelligenceOS exposes externally; every method here delegates to
 * `context/` (reads) or existing domain/pipeline services (writes) and
 * returns only contract-shaped data.
 *
 * This class performs NO cognition logic of its own. Every method is a thin
 * adapter: translate the contract's input shape into what an existing Epic 2
 * service needs, call it, translate the result back. See each method's
 * docblock for exactly which existing service it delegates to, and — where
 * relevant — the scoping mismatch between the contract (workspaceId only)
 * and Epic 2 (userId-first) that had to be adapted around.
 */

import type {
  CognitionProvider,
  CognitionContext,
  CognitionRequest,
  ObservationInput,
  CognitionReviewDecision,
  CognitionSummary,
  CognitionHealth,
} from '@platform/cognition-contract';
import { createDegradedCognitionContext } from '@platform/cognition-contract';

import type { WorkspaceIntelligenceDomain } from '../domains/WorkspaceIntelligenceDomain';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import { ContextBuilder } from '../context/ContextBuilder';
import { deriveVoiceProfile } from '../context/voiceMapping';
import { EntityNotFoundError, ValidationError } from '../errors';
import type { HealthChecker } from './HealthChecker';

export interface CognitionProviderImplDeps {
  workspace: WorkspaceIntelligenceDomain;
  user: UserIntelligenceDomain;
  health: HealthChecker;
  /**
   * Injectable for tests / observability; defaults to `console`. Never
   * thrown to the caller — `observe()` must never fail the request that
   * triggered it (COGNITION_CONTRACT_SPEC.md §3).
   */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class CognitionProviderImpl implements CognitionProvider {
  private readonly workspace: WorkspaceIntelligenceDomain;
  private readonly user: UserIntelligenceDomain;
  private readonly health: HealthChecker;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly contextBuilder: ContextBuilder;

  constructor(deps: CognitionProviderImplDeps) {
    this.workspace = deps.workspace;
    this.user = deps.user;
    this.health = deps.health;
    this.logger = deps.logger ?? console;
    this.contextBuilder = new ContextBuilder(this.workspace);
  }

  /**
   * Delegates entirely to `context/ContextBuilder` (new — Milestone 2), which
   * composes `WorkspaceIntelligenceDomain.getWorkspaceLearnings()` (existing,
   * unmodified). On any genuine fetch failure, falls back to
   * `createDegradedCognitionContext()` — the exact same fallback value
   * BrandOS's own `HttpCognitionProvider` already uses on its side, imported
   * from the same contract package so the two can never drift. This
   * satisfies "resolveCognitionContext never partially resolves ... either a
   * complete context ... or an explicit failure" (COGNITION_CONTRACT_SPEC.md
   * §3) by treating a fetch failure as "explicit failure, degrade" rather
   * than propagating — matching BrandOS's already-documented expectation
   * that this call must never hard-fail a generation request.
   */
  async resolveCognitionContext(request: CognitionRequest): Promise<CognitionContext> {
    try {
      return await this.contextBuilder.build(request.workspaceId, request.taskType);
    } catch (err) {
      this.logger.error(
        `[CognitionProviderImpl] resolveCognitionContext failed for workspace ${request.workspaceId}, returning degraded context:`,
        err,
      );
      return createDegradedCognitionContext(request.workspaceId);
    }
  }

  /**
   * Milestone 2 scope decision — see the Milestone 2 report, "Known
   * Limitations," for the full reasoning. Short version: `ObservationInput`
   * has no `userId`, and every write path capable of turning an observation
   * into a Learning Pipeline signal (`FeedbackProcessor` → `SignalExtractor`
   * → ...) requires one, including at the database level (the `learnings`
   * table's `user_id` is a real foreign key — see
   * `WorkspaceIntelligenceDomain.upsertWorkspaceLearning`'s own comment
   * about this exact constraint). Fabricating a sentinel userId to force a
   * write would violate "do not recreate learning ... functionality" by
   * routing around the pipeline's real ownership model instead of
   * respecting it.
   *
   * This method therefore durably accepts the report (never throws, never
   * blocks — satisfies the contract's "fire and forget" requirement) and
   * records it for observability. It does not yet feed the Learning
   * Pipeline. Wiring that up is Milestone 3 work, gated on deciding how a
   * workspace-scoped observation attributes to a user (or on the Learning
   * Pipeline gaining a workspace-native ingestion path) — flagged, not
   * silently dropped.
   */
  async observe(input: ObservationInput): Promise<void> {
    this.logger.info('[CognitionProviderImpl] observation received (not yet pipeline-fed):', {
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      score: input.score,
      topic: input.topic,
      artifactType: input.artifactType,
      wasRepaired: input.wasRepaired,
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
  }

  /**
   * Delegates to `UserIntelligenceDomain.reviewLearningForWorkspace`
   * (new — Milestone 2), which reuses the exact fetch-and-transition logic
   * `reviewLearning` already had (extracted, not duplicated), gated on
   * `workspace_id` instead of `user_id` since `CognitionReviewDecision` has
   * no userId either. `entryId` maps directly to Epic 2's `learningId` —
   * the contract's "opaque id BrandOS never interprets" requirement holds
   * exactly, since a Learning's id was always opaque to BrandOS.
   *
   * Errors are allowed to propagate (not swallowed), matching
   * `HttpCognitionProvider`'s documented treatment of `review()` as a
   * human-triggered UI action that should surface real errors, not the
   * "swallow and degrade" treatment given to `observe()`.
   */
  async review(decision: CognitionReviewDecision): Promise<void> {
    await this.user.reviewLearningForWorkspace(
      decision.workspaceId,
      decision.entryId,
      decision.approved,
      decision.reviewedBy,
    );
  }

  /**
   * Composed from the same `WorkspaceIntelligenceDomain.getWorkspaceLearnings()`
   * call `resolveCognitionContext` uses — no new DB access, just a different
   * projection of the same already-consolidated data, matching the
   * contract's description of `summarizeCognition` as "distinct... shaped
   * for human reading... carries no guarantee of matching
   * CognitionContext's shape or freshness" (COGNITION_CONTRACT_SPEC.md §3).
   *
   * `CognitionSummary`'s fields (preferredTone, audience, industry,
   * positioning, keywords) don't map 1:1 onto workspace learnings the way
   * `IntelligenceOS.getBrandSummary()`'s `IntelligenceSummary` does onto a
   * user's `IntelligenceProfile` — that existing method is user-scoped and
   * not reusable here for the same reason `buildBlueprint` isn't (see
   * ContextBuilder's scoping note). Fields with no honest workspace-scoped
   * source are returned `null` rather than guessed.
   */
  async summarizeCognition(workspaceId: string): Promise<CognitionSummary> {
    const learnings = await this.workspace.getWorkspaceLearnings(workspaceId);
    const voice = learnings.length > 0 ? deriveVoiceProfile(learnings) : null;

    return {
      preferredTone: voice?.tone ?? null,
      audience: voice?.audienceType ?? null,
      industry: voice?.domain ?? null,
      positioning: voice?.audiencePositioning ?? null,
      keywords: null,
    };
  }

  /**
   * Delegates to `HealthChecker` (new — Milestone 2, thin). Never throws —
   * matches BrandOS's documented expectation that `checkHealth()` "already
   * returns a health value on failure instead of throwing."
   */
  async checkHealth(): Promise<CognitionHealth> {
    return this.health.check();
  }
}

// Re-exported so callers constructing this class don't need to separately
// import Epic 2's error types just to catch them (EntityNotFoundError /
// ValidationError surface unmodified from `review()` — see review() above).
export { EntityNotFoundError, ValidationError };
