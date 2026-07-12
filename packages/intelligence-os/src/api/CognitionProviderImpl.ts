/**
 * CognitionProviderImpl.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * IntelligenceOS's implementation of `CognitionProvider`
 * (`@platform/cognition-contract`) — the interface BrandOS's
 * `HttpCognitionProvider` already calls. Per
 * `PLATFORM_CONTRACT.md` §3, `api/` is the only module
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
import type { FeedbackProcessor } from '../pipeline/FeedbackProcessor';

export interface CognitionProviderImplDeps {
  workspace: WorkspaceIntelligenceDomain;
  user: UserIntelligenceDomain;
  health: HealthChecker;
  /**
   * ADR-003 (Subject-Centric Intelligence) — the shared pipeline
   * orchestrator `observe()` now delegates to (`processObservation()`),
   * the same instance `IntelligenceOS` already constructs and registers
   * on the event bus for the User-subject path. See `observe()`'s
   * docblock below.
   */
  feedbackProcessor: FeedbackProcessor;
  /**
   * Injectable for tests / observability; defaults to `console`. Never
   * thrown to the caller — `observe()` must never fail the request that
   * triggered it (PLATFORM_CONTRACT.md §3).
   */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class CognitionProviderImpl implements CognitionProvider {
  private readonly workspace: WorkspaceIntelligenceDomain;
  private readonly user: UserIntelligenceDomain;
  private readonly health: HealthChecker;
  private readonly feedbackProcessor: FeedbackProcessor;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly contextBuilder: ContextBuilder;

  constructor(deps: CognitionProviderImplDeps) {
    this.workspace = deps.workspace;
    this.user = deps.user;
    this.health = deps.health;
    this.feedbackProcessor = deps.feedbackProcessor;
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
   * complete context ... or an explicit failure" (PLATFORM_CONTRACT.md
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
   * ADR-003 (Subject-Centric Intelligence) — routes every observation
   * through the same Learning Pipeline (`SignalExtractor` →
   * `ObservationBuilder` → `HypothesisEngine` → `LearningValidator` →
   * `ProfileBuilder`) a User subject's `FeedbackEvent` already runs
   * through, via `FeedbackProcessor.processObservation()`.
   *
   * Supersedes the Milestone 3 Phase 2 fix this method previously
   * implemented — writing a single already-classified `success_metrics`
   * Learning directly via `WorkspaceIntelligenceDomain.upsertWorkspaceLearning()`
   * (see `context/observationToWorkspaceLearning.ts`'s former docblock).
   * That was an explicitly documented scope cut ("routing a workspace-only
   * observation through [the Learning Pipeline] ... is out of scope for
   * this fix"), not a permanent design decision — ADR-003 is the follow-up
   * that closes it: a Workspace observation now earns corroboration,
   * respects confidence ceilings, and can drive a real Workspace identity
   * synthesis in `ContextBuilder`, exactly as a User's evidence does.
   *
   * Still fire-and-forget from BrandOS's point of view:
   * `FeedbackProcessor.processObservation()` never throws (mirrors
   * `process()`'s existing per-stage error containment into
   * `PipelineRunResult.errors`), and any error is additionally logged
   * here rather than propagated, per the contract's "observe() must never
   * block or fail the generation path" requirement.
   */
  async observe(input: ObservationInput): Promise<void> {
    this.logger.info('[CognitionProviderImpl] observation received:', {
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      score: input.score,
      topic: input.topic,
      artifactType: input.artifactType,
      wasRepaired: input.wasRepaired,
      observedAt: input.observedAt ?? new Date().toISOString(),
    });

    try {
      const result = await this.feedbackProcessor.processObservation(input);
      this.logger.info('[CognitionProviderImpl] observation processed by the Learning Pipeline:', {
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        signalsProcessed: result.signalsProcessed,
        learningsCreated: result.learningsCreated,
        profileRebuilt: result.profileRebuilt,
        errorCount: result.errors.length,
      });
    } catch (err) {
      // Never propagate — observe() is fire-and-forget by contract. In
      // practice processObservation() already contains stage failures in
      // its own result.errors and does not throw; this catch exists as a
      // last-resort guard, matching the discipline this method already
      // held before ADR-003.
      this.logger.error(
        `[CognitionProviderImpl] failed to process observation for ${input.workspaceId}:`,
        err,
      );
    }
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
   * CognitionContext's shape or freshness" (PLATFORM_CONTRACT.md §3).
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
