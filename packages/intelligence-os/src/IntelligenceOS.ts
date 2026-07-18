/**
 * IntelligenceOS.ts
 *
 * Root class. The platform's primary entry point for any consumer.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Sections 2.1 and 10.2.
 *
 * Epic 2 (Platform Publication): this class now formally `implements
 * IIntelligenceProvider` (see ./IIntelligenceProvider.ts) — a compile-time
 * guarantee that its public surface and the platform's published provider
 * contract never drift apart. A consumer that wants to program against the
 * interface rather than this concrete class can use IntelligenceOSProvider
 * (./compat/IntelligenceOSProvider.ts) instead — same behaviour, interface-typed.
 *
 * Public API surface (6 methods, fixed for all sprints, plus considered
 * post-Sprint-0 additions ingestWorkspaceConfiguration() and
 * recordCorrection() — see their own docblocks for why each was a separate,
 * considered decision per ARCHITECTURE.md §11 Rule 7):
 *   buildBlueprint()        — Sprint 1 (Blueprint Assembly)
 *   recordFeedbackEvent()   — Sprint 0 (write path), Sprint 2 (pipeline trigger)
 *   ingestKnowledgeAsset()  — Sprint 3 (Onboarding Intelligence)
 *   upsertProject()         — Sprint 0 (write path)
 *   ingestWorkspaceConfiguration() — ADR-003 (added to IIntelligenceProvider
 *                                    during the Completion Mission session)
 *   recordCorrection()      — emitter half of intelligence.user.correction
 *                              (added during the IntelligenceOS Completion
 *                              Plan execution session)
 *
 * Sprint 0 behaviour:
 *   buildBlueprint()        → throws PhaseNotImplementedError
 *   recordFeedbackEvent()   → persists to feedback_events + emits event (REAL)
 *   ingestKnowledgeAsset()  → throws PhaseNotImplementedError
 *   upsertProject()         → upserts intelligence.projects + emits event (REAL)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactRequest, ArtifactBlueprint, FeedbackEvent } from '@intelligence-os/shared-types';
import type { IntelligenceSummary } from '@intelligence-os/shared-types';
import type { IntelligenceEventBus } from './events/IntelligenceEventBus';
import type { KnowledgeAssetInput, ProjectInput, WorkspaceConfigurationInput, UserCorrectionInput } from './types/domains';
import type { IIntelligenceProvider } from './IIntelligenceProvider';
import type { CognitionProvider } from '@platform/cognition-contract';

import { InProcessEventBus } from './events/IntelligenceEventBus';
import { UserIntelligenceDomain } from './domains/UserIntelligenceDomain';
import { ProjectIntelligenceDomain } from './domains/ProjectIntelligenceDomain';
import { ArtifactIntelligenceDomain } from './domains/ArtifactIntelligenceDomain';
import { KnowledgeIntelligenceDomain } from './domains/KnowledgeIntelligenceDomain';
import { RelationshipIntelligenceDomain } from './domains/RelationshipIntelligenceDomain';
import { WorkspaceIntelligenceDomain } from './domains/WorkspaceIntelligenceDomain';
import { BlueprintBuilder } from './blueprint/BlueprintBuilder';
import { FeedbackProcessor } from './pipeline/FeedbackProcessor';
import { KnowledgeProcessor } from './knowledge/KnowledgeProcessor';
import { CognitionProviderImpl } from './api/CognitionProviderImpl';
import { HealthChecker } from './api/HealthChecker';

// ── Configuration ─────────────────────────────────────────────────────────────

export interface IntelligenceOSConfig {
  /**
   * A Supabase client initialised with the SERVICE ROLE key.
   * Intelligence OS needs the service role to bypass RLS and write to
   * the intelligence schema on behalf of users.
   *
   * Source: Architecture Section 10.2.
   *
   * ⚠️  Never expose this client to the browser. It belongs only in the
   *     consumer's server / API layer.
   */
  supabase: SupabaseClient;

  /**
   * Event bus implementation. Defaults to InProcessEventBus (synchronous,
   * in-memory, suitable for development and testing). Swap to BullMQEventBus
   * or InngestEventBus for production (Sprint 4, consumer integration).
   */
  eventBus?: IntelligenceEventBus;
}

// ── Root class ────────────────────────────────────────────────────────────────

export class IntelligenceOS implements IIntelligenceProvider {
  /** @internal — accessed directly by tests via the `domains` accessor */
  readonly domains: {
    user:         UserIntelligenceDomain;
    project:      ProjectIntelligenceDomain;
    artifact:     ArtifactIntelligenceDomain;
    knowledge:    KnowledgeIntelligenceDomain;
    relationship: RelationshipIntelligenceDomain;
    workspace:    WorkspaceIntelligenceDomain;
  };

  private readonly bus:               IntelligenceEventBus;
  private readonly blueprintBuilder:  BlueprintBuilder;
  private readonly feedbackProcessor: FeedbackProcessor;
  private readonly knowledgeProcessor: KnowledgeProcessor;
  private readonly supabase:          SupabaseClient;
  /** Lazily constructed — most consumers (e.g. BrandOS-facing HTTP deployment)
   *  will want it; others (pure buildBlueprint()/recordFeedbackEvent() callers)
   *  never touch it, so it isn't built eagerly in the constructor. */
  private cognitionProvider: CognitionProvider | undefined;

  constructor(config: IntelligenceOSConfig) {
    this.supabase = config.supabase;
    this.bus = config.eventBus ?? new InProcessEventBus();

    this.domains = {
      user:         new UserIntelligenceDomain(config.supabase),
      project:      new ProjectIntelligenceDomain(config.supabase),
      artifact:     new ArtifactIntelligenceDomain(config.supabase),
      knowledge:    new KnowledgeIntelligenceDomain(config.supabase),
      relationship: new RelationshipIntelligenceDomain(config.supabase),
      workspace:    new WorkspaceIntelligenceDomain(config.supabase),
    };

    this.blueprintBuilder = new BlueprintBuilder(
      {
        user:      this.domains.user,
        project:   this.domains.project,
        artifact:  this.domains.artifact,
        knowledge: this.domains.knowledge,
        workspace: this.domains.workspace,
      },
      this.bus,
    );

    // Sprint 2: wire Learning Pipeline. FeedbackProcessor subscribes to
    // 'intelligence.artifact.feedback' (and, as of the Completion Mission
    // session, 'intelligence.user.correction') and drives the full
    // Signal → Profile flow. Persistence routes through
    // UserIntelligenceDomain and ArtifactIntelligenceDomain (Gap Analysis
    // G-2, resolved this session) rather than a private client.
    this.feedbackProcessor = new FeedbackProcessor(this.bus, this.domains.user, this.domains.artifact, this.domains.knowledge);
    this.feedbackProcessor.register();

    // Sprint 3: wire Knowledge Intelligence. KnowledgeProcessor subscribes to
    // 'intelligence.knowledge_asset.uploaded' and drives the extraction
    // pipeline. Persistence routes through KnowledgeIntelligenceDomain (Gap
    // Analysis G-2, resolved this session) rather than a private client.
    this.knowledgeProcessor = new KnowledgeProcessor(this.domains.knowledge, this.bus);
    this.knowledgeProcessor.register();
  }

  /**
   * Called before artifact generation.
   * Returns a fully populated ArtifactBlueprint.
   *
   * LIVE — Sprint 1 (Blueprint Assembly).
   * Always returns a blueprint, even for brand-new users with no intelligence.
   */
  async buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint> {
    return this.blueprintBuilder.build(request);
  }

  /**
   * Called after artifact delivery/publish.
   * Persists the feedback event to `intelligence.feedback_events` immediately,
   * then emits `intelligence.artifact.feedback` on the event bus for async
   * pipeline processing (Sprint 2 Learning Pipeline subscribes to this).
   *
   * Returns immediately — pipeline processing is fully asynchronous.
   *
   * REAL in Sprint 0 (write path live).
   * PIPELINE ACTIVATION in Sprint 2 (FeedbackProcessor subscribes to the event).
   */
  async recordFeedbackEvent(event: FeedbackEvent): Promise<void> {
    // Persist synchronously (audit trail, correlates with blueprint_ref).
    await this.domains.artifact.recordFeedbackEvent(event);

    // Emit for async pipeline processing. Sprint 2+ subscribes here.
    await this.bus.emit('intelligence.artifact.feedback', {
      ...event,
      occurredAt: new Date().toISOString(),
    });
  }

  /**
   * Called at user onboarding or when a knowledge asset is uploaded.
   * Returns the persisted asset id; extraction runs synchronously in Phase 1
   * (Sprint 3) and fully via the event bus in Sprint 4.
   *
   * LIVE — Sprint 3 (Knowledge Intelligence).
   * Requires: KnowledgeProcessor, which drives the full extraction pipeline:
   *   KnowledgeAssetExtractor → VocabularyExtractor → FrameworkExtractor
   *   → PatternExtractor → KnowledgeValidator → persisted KnowledgeAsset
   *
   * @param asset   The knowledge asset input (required).
   * @param rawContent  The raw text content of the asset. Optional in the public
   *                    API — if omitted, the asset is persisted with low confidence
   *                    and the event-driven extraction path is used when Sprint 4
   *                    adds content retrieval from storage.
   * @param existingAssetId  Cognitive Platform Evolution Program, EM-2.2/
   *                    EM-2.6. When supplied, re-runs extraction and
   *                    upserts the SAME asset id instead of minting a new
   *                    one — `persistExtracted()` already upserts by id
   *                    (`onConflict: 'id'`), so this was previously unused
   *                    plumbing: every call generated a fresh UUID
   *                    regardless of caller intent, which is what forced
   *                    BrandOS's asset-analyze route to route re-analysis
   *                    through `observe()` instead of this method (there
   *                    was no way to say "update, don't duplicate"). Omit
   *                    for a genuinely new asset.
   */
  async ingestKnowledgeAsset(
    asset: KnowledgeAssetInput,
    rawContent = '',
    existingAssetId?: string,
  ): Promise<string> {
    const assetId = existingAssetId ?? crypto.randomUUID();

    // Completion Mission (RCA finding — double-processing / empty-content
    // overwrite): this method used to (a) call
    // `knowledgeProcessor.process()` directly with the real `rawContent`,
    // AND (b) emit `intelligence.knowledge_asset.uploaded` immediately
    // afterward "for observability consumers" — except `KnowledgeProcessor`
    // itself is subscribed to that exact event (see
    // `knowledge/KnowledgeProcessor.ts::register()`), so every ingested
    // asset was silently processed a second time, with the event handler's
    // hardcoded empty-string content. Because `persistExtracted()` upserts
    // by `id`, that second, content-free pass overwrote the first, correct
    // extraction — the row survived (still `is_current: true`) but with
    // empty vocabulary/frameworks/patterns and `confidence` collapsed to
    // `EMPTY_CONTENT_CONFIDENCE` (0.20).
    //
    // Fix: process the asset exactly once. The event remains the single
    // trigger for extraction (so `KnowledgeProcessor`'s existing
    // event-driven test coverage and any other bus subscriber keep
    // working unmodified) — it now simply carries the real `rawContent`
    // instead of being emitted as a content-free "notification" alongside
    // a separate, duplicate direct call.
    await this.bus.emit('intelligence.knowledge_asset.uploaded', {
      userId:        asset.userId ?? '',
      assetId,
      ownerType:     asset.ownerType,
      projectId:     asset.projectId ?? null,
      workspaceId:   asset.workspaceId ?? null,
      assetType:     asset.assetType,
      title:         asset.title,
      sourceFileRef: asset.sourceFileRef ?? '',
      rawContent,
      occurredAt:    new Date().toISOString(),
    });

    return assetId;
  }

  /**
   * ADR-003 (Subject-Centric Intelligence) §2.4 — ingests explicit,
   * admin-declared workspace configuration (a persona/brand-voice
   * override, identity declarations, compliance requirements) as
   * Knowledge, modeled on this class's existing `ingestKnowledgeAsset()`
   * entry point rather than routed through the Learning Pipeline or a new
   * `CognitionProvider` method (`PLATFORM_CONTRACT.md` §5 forbids a sixth
   * operation added to serve one feature). See `types/domains.ts`'s
   * `WorkspaceConfigurationInput` for the full rationale and
   * `context/ContextBuilder.ts` for how the result is applied (top
   * authority, ahead of Learning-derived voice and identity).
   *
   * Promoted onto `IIntelligenceProvider` during the Completion Mission
   * session, closing that audit's finding D-4 (a real, correct method
   * with zero reachable callers in either repository). This was
   * previously deferred as a separate, considered decision per
   * Architectural Rule 7 — that review happened this session: the method's
   * behavior and shape were already stable and test-covered, so the only
   * open question was reachability, and leaving a correct, load-bearing
   * half of ADR-003 unreachable indefinitely was a worse outcome than
   * making the (backwards-compatible, additive) interface change. Also
   * reachable over HTTP via `POST /v1/workspace-configuration`
   * (`api/http/server.ts`), the same optional-port pattern
   * `ingestKnowledgeAsset()` already uses for `/v1/knowledge/ingest`.
   *
   * Returns the persisted KnowledgeAsset's id.
   */
  async ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string> {
    return this.domains.knowledge.upsertWorkspaceConfiguration(input);
  }

  /**
   * Called when a consumer-side project is created or updated.
   * Upserts the intelligence-side project record and emits
   * `intelligence.project.created` (idempotent — safe to call on every sync).
   * Returns the intelligence project id.
   *
   * REAL in Sprint 0.
   */
  async upsertProject(input: ProjectInput): Promise<string> {
    const id = await this.domains.project.upsertProject(input);

    await this.bus.emit('intelligence.project.created', {
      userId: input.userId,
      projectId: id,
      brandosProjectId: input.brandosProjectId ?? null,
      name: input.name,
      projectType: input.projectType ?? null,
      lifecycleState: input.lifecycleState ?? 'IDEATION',
      occurredAt: new Date().toISOString(),
    });

    return id;
  }

  /**
   * The emitter half of `intelligence.user.correction` (see
   * `UserCorrectionInput` in `types/domains.ts` for the full rationale).
   * Corrections are the highest-authority signal in the system (Contracts
   * B.2) — `FeedbackProcessor.processCorrection()` routes this straight to
   * `LearningValidator.maybeConfirm()`, bypassing the normal
   * Signal → Observation → Hypothesis corroboration gate entirely.
   *
   * No dedicated persistence table exists for corrections (unlike
   * `recordFeedbackEvent()`, which writes an audit-trail row before
   * emitting) — a correction's only durable effect is the Learning it
   * confirms, exactly like `ingestWorkspaceConfiguration()`'s treatment of
   * declarative input with no separate event-log table of its own. This
   * method therefore purely emits; `occurredAt` is stamped here rather
   * than accepted as input, matching `recordFeedbackEvent()`'s convention.
   *
   * Returns immediately — like every other write method on this class,
   * processing is fully asynchronous via the event bus.
   */
  async recordCorrection(input: UserCorrectionInput): Promise<void> {
    await this.bus.emit('intelligence.user.correction', {
      userId: input.userId,
      correctionType: input.correctionType,
      taxonomyCategory: input.taxonomyCategory ?? null,
      correctedValue: input.correctedValue,
      context: input.context ?? null,
      occurredAt: new Date().toISOString(),
    });
  }

  // ── E1-1: Human Learning Review API ────────────────────────────────────────

  /**
   * Transitions a FLAGGED learning to ACTIVE (approved=true) or
   * ARCHIVED (approved=false). Represents supervisory review of a
   * machine-proposed signal by an authorised reviewer.
   *
   * State transition: FLAGGED → ACTIVE | FLAGGED → ARCHIVED
   *
   * Throws EntityNotFoundError when learningId does not exist.
   * Throws ValidationError when the learning belongs to a different userId.
   * Emits `intelligence.learning.reviewed` on success.
   *
   * Source: Engineering Roadmap E1-1.
   */
  async reviewLearning(
    userId: string,
    learningId: string,
    approved: boolean,
    reviewedBy: string,
  ): Promise<void> {
    const { newState } = await this.domains.user.reviewLearning(
      userId, learningId, approved, reviewedBy,
    );

    await this.bus.emit('intelligence.learning.reviewed', {
      userId,
      learningId,
      approved,
      reviewedBy,
      newState,
      occurredAt: new Date().toISOString(),
    });
  }

  // ── E1-3: Brand Summary Query API ──────────────────────────────────────────

  /**
   * Returns a summary of the intelligence available for a user (and
   * optionally a workspace). Used by workspace settings UI and diagnostics.
   *
   * Always succeeds — returns a degraded summary when no profile exists.
   *
   * Source: Engineering Roadmap E1-3.
   */
  async getBrandSummary(params: {
    userId: string;
    workspaceId?: string;
  }): Promise<IntelligenceSummary> {
    const { userId, workspaceId } = params;

    const [profile, archetype, activeLearningsCount, topTaxonomyCategories] =
      await Promise.all([
        this.domains.user.getCurrentProfile(userId).catch(() => null),
        this.domains.user.getCurrentArchetype(userId).catch(() => null),
        this.domains.user.countActiveLearnings(userId, workspaceId).catch(() => 0),
        this.domains.user.getTopTaxonomyCategories(userId, 3).catch(() => [] as string[]),
      ]);

    if (!profile) {
      return {
        compositeConfidence:   0,
        archetypePrimary:      null,
        archetypeConfidence:   null,
        activeLearningsCount,
        topTaxonomyCategories,
        voiceSummary:          null,
        degraded:              true,
      };
    }

    return {
      compositeConfidence:   profile.compositeConfidence,
      archetypePrimary:      archetype?.archetypeType ?? profile.archetypePrimary ?? null,
      archetypeConfidence:   archetype?.confidence    ?? profile.archetypeConfidence ?? null,
      activeLearningsCount,
      topTaxonomyCategories,
      voiceSummary:          profile.voiceSummary,
      degraded:              false,
    };
  }

  /**
   * Exposes the event bus so any consumer can subscribe to Intelligence OS
   * pipeline events (e.g. intelligence.profile.updated, intelligence.blueprint.built).
   *
   * Source: Architecture Section 10.2 (observable pipeline events).
   */
  get eventBus(): IntelligenceEventBus {
    return this.bus;
  }

  // ── Milestone 2: CognitionProvider ───────────────────────────────────────
  //
  // Returns this IntelligenceOS instance's implementation of
  // `CognitionProvider` (`@platform/cognition-contract`) — the interface
  // BrandOS actually consumes. Distinct from `IIntelligenceProvider` above:
  // that is Epic 2's own public platform surface (buildBlueprint,
  // recordFeedbackEvent, ...); this is the separate, narrower cross-platform
  // contract with BrandOS specifically. Both are valid, coexisting public
  // surfaces of the same underlying domains — see the Milestone 2 report,
  // "Architecture Implemented," for why keeping both was the right call
  // rather than a contract violation.
  //
  // Composed from the SAME domain instances (`this.domains.workspace`,
  // `this.domains.user`) already constructed above — no second set of
  // domain objects, no duplicated Supabase clients.

  /**
   * Returns the `CognitionProvider` implementation for this instance,
   * constructing it on first access. Pass to `createCognitionHttpServer`
   * (`./api/http/server.ts`) to expose it over HTTP for BrandOS.
   */
  asCognitionProvider(): CognitionProvider {
    if (!this.cognitionProvider) {
      this.cognitionProvider = new CognitionProviderImpl({
        workspace: this.domains.workspace,
        user: this.domains.user,
        health: new HealthChecker(this.supabase),
        // ADR-003 (Subject-Centric Intelligence): the SAME FeedbackProcessor
        // instance already constructed and registered above — one Learning
        // Pipeline orchestrator serving both Subject types, not a second one.
        feedbackProcessor: this.feedbackProcessor,
      });
    }
    return this.cognitionProvider;
  }
}
