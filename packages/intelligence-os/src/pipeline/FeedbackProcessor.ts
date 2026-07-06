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
 * Source: BrandOS IntelligenceOS Architecture Section 5 (Learning Pipeline).
 * Source: BrandOS Intelligence Contracts B.2 (full pipeline flow).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeedbackEventPayload } from '../types/events';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import type { PipelineRunResult, PipelineStageError } from './types';
import { SignalExtractor } from './SignalExtractor';
import { ObservationBuilder } from './ObservationBuilder';
import { HypothesisEngine } from './HypothesisEngine';
import { LearningValidator } from './LearningValidator';
import { ProfileBuilder } from './ProfileBuilder';
import { DatabaseError } from '../errors';

// ── FeedbackProcessor ─────────────────────────────────────────────────────────

export class FeedbackProcessor {
  private readonly signalExtractor: SignalExtractor;
  private readonly observationBuilder: ObservationBuilder;
  private readonly hypothesisEngine: HypothesisEngine;
  private readonly learningValidator: LearningValidator;
  private readonly profileBuilder: ProfileBuilder;

  constructor(
    private readonly db: SupabaseClient,
    private readonly bus: IntelligenceEventBus,
  ) {
    this.signalExtractor   = new SignalExtractor();
    this.observationBuilder = new ObservationBuilder();
    this.hypothesisEngine  = new HypothesisEngine(db);
    this.learningValidator = new LearningValidator(db);
    this.profileBuilder    = new ProfileBuilder(db, bus);
  }

  /**
   * Registers the pipeline handler on the event bus.
   *
   * Must be called once during IntelligenceOS initialisation (Sprint 2 wires
   * this into the IntelligenceOS constructor).
   *
   * The handler is fire-and-forget from the bus perspective — errors are
   * captured in PipelineRunResult and logged, not re-thrown to the bus.
   */
  register(): void {
    this.bus.on('intelligence.artifact.feedback', async (payload) => {
      await this.process(payload as FeedbackEventPayload);
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

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Updates intelligence.feedback_events.signals_extracted = true for the
   * processed event row. Identifies by artifact_id + user_id + signals_extracted=false
   * (most recent unprocessed row for this artifact).
   */
  private async markSignalsExtracted(artifactId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .schema('intelligence')
      .from('feedback_events')
      .update({ signals_extracted: true })
      .eq('artifact_id', artifactId)
      .eq('user_id', userId)
      .eq('signals_extracted', false);

    if (error) {
      throw new DatabaseError(
        `Failed to mark signals_extracted for artifact ${artifactId}`,
        error,
      );
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageError(
  stage: PipelineStageError['stage'],
  message: string,
  cause?: unknown,
): PipelineStageError {
  return { stage, message, cause };
}
