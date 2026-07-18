/**
 * FeedbackProcessor.ts
 *
 * Pipeline orchestrator for the Learning Pipeline.
 *
 * Responsibilities (per Sprint 2 spec):
 *   • Subscribe to 'intelligence.artifact.feedback' on the event bus
 *   • Create Signals via SignalExtractor
 *   • Build Observations via ObservationBuilder
 *   • Process Hypotheses via HypothesisEngine
 *   • Validate and promote Learnings via LearningValidator
 *   • Trigger profile rebuild via ProfileBuilder when thresholds are met
 *   • Mark feedback_events.signals_extracted = true after processing
 *   • Emit pipeline milestone events for observability
 *   • Subscribe to 'intelligence.user.correction' and route it to
 *     LearningValidator.maybeConfirm() — the explicit-correction fast path
 *     (Completion Mission: this connects a previously dormant capability;
 *     the event type, its payload contract, and the handler method all
 *     already existed but nothing wired them together — see
 *     IMPLEMENTATION_STATUS.md for the trace)
 *
 * Graceful degradation (per spec):
 *   • New user with no profile → pipeline runs, profile is built from scratch
 *   • Missing project → pipeline continues with global context scope
 *   • Any stage failure → logged to PipelineRunResult.errors; pipeline
 *     continues with remaining signals rather than aborting
 *
 * Architecture constraint: FeedbackProcessor is the ONLY place where
 * pipeline components are wired together. Each component is injected via
 * constructor (testable, no hidden coupling).
 *
 * Persistence note (Gap Analysis G-2, resolved this session): this class
 * holds no SupabaseClient of its own. It takes both `UserIntelligenceDomain`
 * (routed into the three pipeline stage classes it wires together) and
 * `ArtifactIntelligenceDomain` (for the one write this orchestrator itself
 * performs: marking `feedback_events.signals_extracted = true`, on the
 * table `ArtifactIntelligenceDomain` owns). Prior to this session, this
 * orchestrator performed that one update via a private `SupabaseClient` —
 * a smaller instance of the exact anti-pattern G-2 flagged for the pipeline
 * *stage* classes, found and fixed in the same pass even though the
 * original Gap Analysis didn't call it out by name.
 *
 * Source: BrandOS IntelligenceOS Architecture Section 5 (Learning Pipeline).
 * Source: BrandOS Intelligence Contracts B.2 (full pipeline flow).
 */

import type { FeedbackEventPayload, UserCorrectionPayload } from '../types/events';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { ArtifactIntelligenceDomain } from '../domains/ArtifactIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../domains/KnowledgeIntelligenceDomain';
import type { TaxonomyCategory } from '../types/entities';
import type { PipelineRunResult, PipelineStageError } from './types';
import type { ObservationInput } from '@platform/cognition-contract';
import { userSubject, workspaceSubject, type SubjectRef } from '../types/subject';
import { SignalExtractor } from './SignalExtractor';
import { ObservationBuilder } from './ObservationBuilder';
import { HypothesisEngine } from './HypothesisEngine';
import { LearningValidator } from './LearningValidator';
import { ProfileBuilder } from './ProfileBuilder';

// ── FeedbackProcessor ─────────────────────────────────────────────────────────

export class FeedbackProcessor {
  private readonly signalExtractor: SignalExtractor;
  private readonly observationBuilder: ObservationBuilder;
  private readonly hypothesisEngine: HypothesisEngine;
  private readonly learningValidator: LearningValidator;
  private readonly profileBuilder: ProfileBuilder;

  constructor(
    private readonly bus: IntelligenceEventBus,
    private readonly userDomain: UserIntelligenceDomain,
    private readonly artifactDomain: ArtifactIntelligenceDomain,
    /** ADR-004 (Cognitive Consolidation) — passed through to this class's internal ProfileBuilder, mirroring userDomain/artifactDomain's existing pattern. */
    private readonly knowledgeDomain: KnowledgeIntelligenceDomain,
  ) {
    this.signalExtractor   = new SignalExtractor();
    this.observationBuilder = new ObservationBuilder();
    this.hypothesisEngine  = new HypothesisEngine(userDomain);
    this.learningValidator = new LearningValidator(userDomain);
    this.profileBuilder    = new ProfileBuilder(userDomain, bus, knowledgeDomain);
  }

  /**
   * Registers the pipeline handlers on the event bus.
   *
   * Must be called once during IntelligenceOS initialisation (Sprint 2 wires
   * this into the IntelligenceOS constructor).
   *
   * The handlers are fire-and-forget from the bus perspective — errors are
   * captured in PipelineRunResult and logged, not re-thrown to the bus
   * (the correction handler logs and swallows, matching that pattern).
   */
  register(): void {
    this.bus.on('intelligence.artifact.feedback', async (payload) => {
      await this.process(payload as FeedbackEventPayload);
    });

    this.bus.on('intelligence.user.correction', async (payload) => {
      await this.processCorrection(payload as UserCorrectionPayload);
    });

    // ADR-004 (Cognitive Consolidation) §3.2 — the Knowledge Pipeline's
    // existing extraction-milestone event, now also consumed here. Filtered
    // to entityType === 'knowledge_asset' so a future, different use of
    // this same event type doesn't silently start triggering profile
    // rebuilds (see the dedicated test for this filter).
    this.bus.on('intelligence.signal.extracted', async (payload) => {
      const p = payload as { entityType?: string };
      if (p.entityType !== 'knowledge_asset') return;
      await this.processKnowledgeExtraction(payload as KnowledgeSignalExtractedPayload);
    });
  }

  /**
   * Processes a single FeedbackEvent through the full pipeline.
   *
   * Returns a PipelineRunResult with counts and any non-fatal errors.
   * Never throws — all errors are captured in result.errors.
   */
  async process(event: FeedbackEventPayload): Promise<PipelineRunResult> {
    const result: PipelineRunResult = {
      userId: event.userId,
      subject: userSubject(event.userId),
      signalsProcessed: 0,
      observationsCreated: 0,
      hypothesesUpdated: 0,
      learningsCreated: 0,
      profileRebuilt: false,
      errors: [],
    };

    // Stage 1: Extract signals
    let signals;
    try {
      signals = this.signalExtractor.extractFromFeedback(event);
      result.signalsProcessed = signals.length;
    } catch (err) {
      result.errors.push(stageError('signal', 'Signal extraction failed', err));
      return result;
    }

    if (signals.length === 0) {
      // No signals produced (e.g. all quarantined) — pipeline ends here
      await this.markSignalsExtracted(event.artifactId, event.userId);
      return result;
    }

    // Tracks which domains had learnings promoted in this run
    const changedDomains = new Set<string>();
    let lastLearning = null;

    // Process each signal through Stages 2–5
    for (const signal of signals) {
      // Stage 2: Build observation
      let observation;
      try {
        observation = this.observationBuilder.build(signal);
        if (!observation) continue; // invalid signal — skip
        result.observationsCreated++;
      } catch (err) {
        result.errors.push(stageError('observation', `Observation build failed for signal ${signal.id}`, err));
        continue;
      }

      // Stage 3: Process hypothesis (find/create/update)
      let hypothesis;
      try {
        hypothesis = await this.hypothesisEngine.process(observation);
        result.hypothesesUpdated++;

        // Emit signal.extracted milestone
        await this.bus.emit('intelligence.signal.extracted', {
          userId: event.userId,
          entityId: signal.id,
          entityType: 'signal',
          hypothesisId: hypothesis.id,
          taxonomyCategory: signal.taxonomyCategory,
          occurredAt: new Date().toISOString(),
        });
      } catch (err) {
        result.errors.push(stageError('hypothesis', `Hypothesis processing failed`, err));
        continue;
      }

      // Stage 4–5: Validate and promote to Learning
      try {
        const validationResult = await this.learningValidator.evaluate(hypothesis, observation);

        if (validationResult.promoted && validationResult.learning) {
          result.learningsCreated++;
          lastLearning = validationResult.learning;
          changedDomains.add(validationResult.learning.domain);

          // Mark the hypothesis as promoted
          await this.hypothesisEngine.markPromoted(hypothesis.id, validationResult.learning.id);

          // Emit learning.validated milestone
          await this.bus.emit('intelligence.learning.validated', {
            userId: event.userId,
            entityId: validationResult.learning.id,
            entityType: 'learning',
            taxonomyCategory: validationResult.learning.taxonomyCategory,
            confidence: validationResult.learning.confidence,
            occurredAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        result.errors.push(stageError('learning', `Learning validation failed for hypothesis ${hypothesis.id}`, err));
        continue;
      }
    }

    // Stage 6: Rebuild profile if warranted
    if (lastLearning) {
      try {
        const rebuildDecision = await this.profileBuilder.shouldRebuild(
          event.userId,
          lastLearning,
        );

        if (rebuildDecision.shouldRebuild) {
          await this.profileBuilder.rebuild(event.userId, Array.from(changedDomains));
          result.profileRebuilt = true;
        }
      } catch (err) {
        result.errors.push(stageError('profile', 'Profile rebuild failed', err));
        // Non-fatal: profile rebuild failure does not invalidate the learnings
      }
    }

    // Mark signals_extracted on the feedback_events row
    try {
      await this.markSignalsExtracted(event.artifactId, event.userId);
    } catch (err) {
      result.errors.push(stageError('signal', 'Failed to mark signals_extracted', err));
    }

    // Opportunistic cleanup of expired hypotheses (non-fatal)
    try {
      await this.hypothesisEngine.discardExpired(event.userId);
    } catch {
      // Silently ignore — cleanup is best-effort
    }

    return result;
  }

  // ── ADR-003 (Subject-Centric Intelligence): Workspace observation entry point ──

  /**
   * Processes a single `CognitionProvider.observe()` payload through the
   * full Learning Pipeline for a Workspace subject — the same six stages
   * `process()` runs for a User subject's FeedbackEvent, generalized via
   * `SubjectRef` rather than duplicated.
   *
   * Supersedes the direct `WorkspaceIntelligenceDomain.upsertWorkspaceLearning()`
   * write `CognitionProviderImpl.observe()` used to perform by hand (see
   * `context/observationToWorkspaceLearning.ts`'s former docblock, and
   * IMPLEMENTATION_STATUS.md for the full history) — that path skipped
   * every corroboration/quarantine/confidence-ceiling gate the Learning
   * Pipeline enforces for a User subject, which was a documented,
   * deliberate Milestone 3 scope cut, not a design decision meant to be
   * permanent (ADR-003 §1).
   *
   * Never throws — `observe()` is fire-and-forget by contract
   * (`PLATFORM_CONTRACT.md` §3); any stage failure is captured in
   * `result.errors` exactly as `process()` already does for the User path.
   *
   * There is no `feedback_events` row for an `ObservationInput` (ADR-003's
   * migration deliberately leaves that table User-only — see migration
   * 004's header note), so this method has no `markSignalsExtracted()`
   * equivalent step.
   */
  async processObservation(input: ObservationInput): Promise<PipelineRunResult> {
    const subject: SubjectRef = { subjectType: 'workspace', subjectId: input.workspaceId };
    const result: PipelineRunResult = {
      userId: input.workspaceId,
      subject,
      signalsProcessed: 0,
      observationsCreated: 0,
      hypothesesUpdated: 0,
      learningsCreated: 0,
      profileRebuilt: false,
      errors: [],
    };

    // Stage 1: Extract signals
    let signals;
    try {
      signals = this.signalExtractor.extractFromObservation(input);
      result.signalsProcessed = signals.length;
    } catch (err) {
      result.errors.push(stageError('signal', 'Signal extraction failed', err));
      return result;
    }

    if (signals.length === 0) {
      // No signals produced (e.g. placeholder score) — pipeline ends here
      return result;
    }

    const changedDomains = new Set<string>();
    let lastLearning = null;

    for (const signal of signals) {
      // Stage 2: Build observation
      let observation;
      try {
        observation = this.observationBuilder.build(signal);
        if (!observation) continue;
        result.observationsCreated++;
      } catch (err) {
        result.errors.push(stageError('observation', `Observation build failed for signal ${signal.id}`, err));
        continue;
      }

      // Stage 3: Process hypothesis (find/create/update)
      let hypothesis;
      try {
        hypothesis = await this.hypothesisEngine.process(observation);
        result.hypothesesUpdated++;

        await this.bus.emit('intelligence.signal.extracted', {
          userId: '',
          workspaceId: input.workspaceId,
          subjectType: 'workspace',
          entityId: signal.id,
          entityType: 'signal',
          hypothesisId: hypothesis.id,
          taxonomyCategory: signal.taxonomyCategory,
          occurredAt: new Date().toISOString(),
        });
      } catch (err) {
        result.errors.push(stageError('hypothesis', 'Hypothesis processing failed', err));
        continue;
      }

      // Stage 4–5: Validate and promote to Learning
      try {
        const validationResult = await this.learningValidator.evaluate(hypothesis, observation);

        if (validationResult.promoted && validationResult.learning) {
          result.learningsCreated++;
          lastLearning = validationResult.learning;
          changedDomains.add(validationResult.learning.domain);

          await this.hypothesisEngine.markPromoted(hypothesis.id, validationResult.learning.id);

          await this.bus.emit('intelligence.learning.validated', {
            userId: '',
            workspaceId: input.workspaceId,
            subjectType: 'workspace',
            entityId: validationResult.learning.id,
            entityType: 'learning',
            taxonomyCategory: validationResult.learning.taxonomyCategory,
            confidence: validationResult.learning.confidence,
            occurredAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        result.errors.push(stageError('learning', `Learning validation failed for hypothesis ${hypothesis.id}`, err));
        continue;
      }
    }

    // Stage 6: Rebuild profile (the Workspace's synthesized identity) if warranted
    if (lastLearning) {
      try {
        const rebuildDecision = await this.profileBuilder.shouldRebuildForSubject(subject, lastLearning);

        if (rebuildDecision.shouldRebuild) {
          await this.profileBuilder.rebuildForSubject(subject, Array.from(changedDomains));
          result.profileRebuilt = true;
        }
      } catch (err) {
        result.errors.push(stageError('profile', 'Profile rebuild failed', err));
      }
    }

    // Opportunistic cleanup of expired hypotheses (non-fatal)
    try {
      await this.hypothesisEngine.discardExpiredForSubject(subject);
    } catch {
      // Silently ignore — cleanup is best-effort
    }

    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Updates intelligence.feedback_events.signals_extracted = true for the
   * processed event row, via ArtifactIntelligenceDomain.markSignalsExtracted()
   * (the table's owning domain).
   */
  private async markSignalsExtracted(artifactId: string, userId: string): Promise<void> {
    await this.artifactDomain.markSignalsExtracted(artifactId, userId);
  }

  /**
   * Handles an `intelligence.user.correction` event by routing it to
   * `LearningValidator.maybeConfirm()` — the explicit-correction fast path.
   *
   * Per Contracts B.2, corrections are the highest-authority signal in the
   * system: they bypass the Signal → Observation → Hypothesis quarantine
   * gate entirely and apply directly to an existing VALIDATED Learning for
   * the same taxonomy category, upgrading it to CONFIRMED.
   *
   * Never throws — a correction that doesn't match any existing Learning is
   * a no-op (there is nothing to confirm), not an error.
   */
  async processCorrection(payload: UserCorrectionPayload): Promise<{ confirmed: boolean }> {
    if (!payload.taxonomyCategory) {
      // A correction with no taxonomy category has nothing to confirm
      // against — Contracts B.2 scopes maybeConfirm() to a specific category.
      return { confirmed: false };
    }

    try {
      const confirmed = await this.learningValidator.maybeConfirm(
        payload.userId,
        payload.taxonomyCategory as TaxonomyCategory,
      );
      return { confirmed };
    } catch {
      // Best-effort: a failed confirmation should not surface as an
      // uncaught rejection on the event bus.
      return { confirmed: false };
    }
  }

  /**
   * ADR-004 (Cognitive Consolidation) §3.2, §12.1 — the fourth
   * FeedbackProcessor entry point, driving straight to a profile
   * rebuild-trigger check rather than through Stages 1-5
   * (Signal/Observation/Hypothesis/Learning), which don't apply to
   * Knowledge — Knowledge doesn't require corroboration, only provenance
   * (ADR-003 §2.4).
   *
   * Resolves the correct SubjectRef from the payload's ownerType/
   * workspaceId/userId (added to `intelligence.signal.extracted`'s
   * emission alongside this change — see `KnowledgeProcessor.ts`'s
   * implementation note), evaluates
   * `ProfileBuilder.shouldRebuildForSubjectFromKnowledge()`, and calls
   * `rebuildForSubject()` if warranted. Never throws — a failed rebuild
   * check/execution should not surface as an uncaught rejection on the
   * event bus, matching `processCorrection()`'s existing convention.
   */
  async processKnowledgeExtraction(payload: KnowledgeSignalExtractedPayload): Promise<{ rebuilt: boolean }> {
    try {
      const subject: SubjectRef =
        payload.ownerType === 'workspace' && payload.workspaceId
          ? workspaceSubject(payload.workspaceId)
          : userSubject(payload.userId);

      const decision = await this.profileBuilder.shouldRebuildForSubjectFromKnowledge(subject, payload.entityId);
      if (!decision.shouldRebuild) {
        return { rebuilt: false };
      }

      await this.profileBuilder.rebuildForSubject(subject, ['knowledge']);
      return { rebuilt: true };
    } catch {
      // Best-effort, matching processCorrection()'s convention above.
      return { rebuilt: false };
    }
  }
}

/**
 * ADR-004 (Cognitive Consolidation) — the shape of
 * `intelligence.signal.extracted` this class actually reads. A local,
 * narrower view of `BaseEventPayload` (the event's declared type in
 * `types/events.ts`) rather than a new event-contract type — the event's
 * declared shape is intentionally a generic, extensible bag
 * (`[key: string]: unknown`) for this exact reason.
 */
interface KnowledgeSignalExtractedPayload {
  userId: string;
  entityId: string;
  entityType: string;
  ownerType?: 'user' | 'project' | 'workspace';
  workspaceId?: string;
  occurredAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageError(
  stage: PipelineStageError['stage'],
  message: string,
  cause?: unknown,
): PipelineStageError {
  return { stage, message, cause };
}
