/**
 * events.ts
 *
 * Intelligence OS event type union and the seven distinct payload contracts.
 *
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 7.2.
 *
 * Epic 2 (Platform Publication) decision: the original 14 event-type strings
 * mixed two namespaces — 5 used a `brandos.*` prefix and 9 used `intelligence.*`.
 * That asymmetry only made sense under the old assumption that BrandOS was
 * the platform's one privileged caller. Now that Intelligence OS is published
 * as an independent platform any application can consume, there is no
 * principled reason one set of event names should be branded after a specific
 * consumer. All 14 event type strings now share a single `intelligence.*`
 * namespace — the platform's own. See Gap Analysis G-1 and
 * docs/IMPLEMENTATION_STATUS.md "Architectural Decisions" for the full
 * rationale. This is a breaking rename with no live caller yet, done in one
 * pass rather than as a future breaking change after publication.
 *
 * Two directions of flow (the prefix no longer encodes direction — see the
 * inline section comments below for which is which):
 *  • Consumer → Intelligence OS  (5 event types): triggers pipeline processing.
 *    Recorded when a consumer calls a public API method
 *    (recordFeedback / ingestKnowledgeAsset / upsertProject / recordCorrection).
 *  • Intelligence OS → (internal + observable) (9 event types): pipeline
 *    milestones that any consumer can observe if it subscribes.
 *
 * Payload mapping: the architecture doc defines 6 specific payload types
 * plus a BaseEventPayload fallback. Sprint/Epic additions since then
 * (LearningReviewedPayload at E1-1, BlueprintBuiltPayload at Epic 2 /
 * E2-1-T1) bring the total to 9 distinct payload contracts across the 14
 * event type strings. Multiple event type strings share the
 * same payload shape where the semantics are identical (e.g.,
 * intelligence.project.created and intelligence.project.updated both carry
 * ProjectPayload).
 */

import type { FeedbackEvent } from '@intelligence-os/shared-types';

// ── 14 event type strings ────────────────────────────────────────────────────

export type IntelligenceEventType =
  // ── Consumer → Intelligence OS (recorded via public API calls) ──────────
  | 'intelligence.artifact.feedback'
  | 'intelligence.knowledge_asset.uploaded'
  | 'intelligence.project.created'
  | 'intelligence.project.updated'
  | 'intelligence.user.correction'
  // ── Intelligence OS pipeline (internal + observable by any consumer) ────
  | 'intelligence.signal.extracted'
  | 'intelligence.hypothesis.created'
  | 'intelligence.hypothesis.promoted'
  | 'intelligence.learning.validated'
  | 'intelligence.learning.confirmed'
  | 'intelligence.learning.reviewed'   // E1-1: supervisory review of a FLAGGED learning
  | 'intelligence.profile.updated'
  | 'intelligence.blueprint.built'
  | 'intelligence.conflict.detected'
  | 'intelligence.conflict.recurring';

// ── 7 payload contracts ──────────────────────────────────────────────────────

/**
 * Payload contract 1: FeedbackEventPayload
 * Carried by: intelligence.artifact.feedback
 */
export interface FeedbackEventPayload extends FeedbackEvent {
  /** Server-assigned timestamp (ISO 8601) for ordering and de-dup. */
  occurredAt: string;
}

/**
 * Payload contract 2: KnowledgeAssetPayload
 * Carried by: intelligence.knowledge_asset.uploaded
 */
export interface KnowledgeAssetPayload {
  userId: string;
  assetId: string;
  ownerType: 'user' | 'project' | 'workspace';
  projectId?: string | null;
  workspaceId?: string | null;
  assetType: string;
  title: string;
  /** Storage key or path to the raw file. */
  sourceFileRef: string;
  /**
   * The extracted text content for this asset. Optional and empty by
   * default for lightweight/observability-only emitters of this event —
   * but `KnowledgeProcessor`'s own extraction-pipeline handler (see
   * `knowledge/KnowledgeProcessor.ts::register()`) is this event's single
   * processing consumer, and requires the real content to extract
   * anything meaningful from. `IntelligenceOS.ingestKnowledgeAsset()` is
   * the sole in-repo emitter and always populates this field with the
   * caller-supplied `rawContent` (Completion Mission — closes the
   * double-processing / empty-content-overwrite defect where this event
   * used to be emitted *in addition to* a separate direct
   * `KnowledgeProcessor.process()` call with the real content, causing the
   * same asset id to be processed twice — once correctly, once with an
   * empty string that silently overwrote the first extraction via
   * `persistExtracted()`'s upsert-by-id).
   */
  rawContent?: string;
  occurredAt: string;
}

/**
 * Payload contract 3: ProjectPayload
 * Carried by: intelligence.project.created AND intelligence.project.updated
 * The event type string distinguishes create vs. update at the bus level;
 * the payload shape is identical.
 */
export interface ProjectPayload {
  userId: string;
  projectId: string;
  brandosProjectId?: string | null;
  name: string;
  projectType?: string | null;
  lifecycleState: 'IDEATION' | 'ACTIVE' | 'WIND_DOWN' | 'ARCHIVED';
  occurredAt: string;
}

/**
 * Payload contract 4: UserCorrectionPayload
 * Carried by: intelligence.user.correction
 *
 * A user correction is the highest-authority signal in the system
 * (Contracts B.2: corrections bypass quarantine and apply immediately).
 * The field `correctedValue` is intentionally loosely typed — corrections
 * may be freeform text, a replaced term, or a structured patch, depending
 * on the context.
 */
export interface UserCorrectionPayload {
  userId: string;
  correctionType: 'vocabulary' | 'tone' | 'style' | 'fact' | 'goal' | 'other';
  taxonomyCategory?: string | null;
  correctedValue: unknown;
  context?: string | null;
  occurredAt: string;
}

/**
 * Payload contract 5: ProfileUpdatedPayload
 * Carried by: intelligence.profile.updated
 */
export interface ProfileUpdatedPayload {
  /** ADR-003: for a Workspace-subject rebuild, this is `''` (no User exists) — read `subjectType`/`workspaceId` instead. Kept required for backward compatibility with existing User-subject subscribers. */
  userId: string;
  /** ADR-003 (Subject-Centric Intelligence) — new, optional. Populated for a Workspace-subject profile rebuild. */
  workspaceId?: string;
  /** ADR-003 — new, optional; absent means 'user' (the pre-ADR-003 default). */
  subjectType?: 'user' | 'workspace';
  profileId: string;
  version: number;
  /** Which domains had learnings that triggered this profile rebuild. */
  changedDomains: string[];
  compositeConfidence: number;
  occurredAt: string;
}

/**
 * Payload contract 6: RecurringConflictPayload
 * Carried by: intelligence.conflict.recurring
 *
 * Fired when the same conflict type recurs ≥2 times for a user, indicating
 * a structural tension in their intelligence model that may need surfacing.
 * (Architecture Section 7.2, distinct from intelligence.conflict.detected.)
 */
export interface RecurringConflictPayload {
  userId: string;
  conflictType: string;
  recurrenceCount: number;
  entityTypes: [string, string];
  mostRecentConflictId: string;
  occurredAt: string;
}

/**
 * Payload contract 7: BaseEventPayload
 * Fallback for all pipeline events not assigned a specific payload shape:
 *   intelligence.signal.extracted
 *   intelligence.hypothesis.created
 *   intelligence.hypothesis.promoted
 *   intelligence.learning.validated
 *   intelligence.learning.confirmed
 *   intelligence.conflict.detected
 *
 * Sprint 1–3 components will replace the BaseEventPayload entries above
 * with specific types as each pipeline stage is implemented. The
 * conditional type below is already structured for those replacements.
 */
export interface BaseEventPayload {
  userId: string;
  entityId: string;
  entityType: string;
  occurredAt: string;
  [key: string]: unknown;
}

/**
 * Payload contract 8: LearningReviewedPayload  (E1-1)
 * Carried by: intelligence.learning.reviewed
 *
 * Emitted after a supervisory review approves or rejects a FLAGGED learning.
 * State transition: FLAGGED → ACTIVE (approved=true) | FLAGGED → ARCHIVED (approved=false)
 */
export interface LearningReviewedPayload {
  userId: string;
  learningId: string;
  approved: boolean;
  reviewedBy: string;
  newState: 'ACTIVE' | 'ARCHIVED';
  occurredAt: string;
}

/**
 * Payload contract 9: BlueprintBuiltPayload  (Epic 2 / E2-1-T1)
 * Carried by: intelligence.blueprint.built
 *
 * Promoted out of the BaseEventPayload fallback now that
 * BlueprintBuilder.build() is a fully implemented capability (not a Sprint
 * 1–3 stub) and Epic 2 has consumers reading `processingMs` off this event
 * for observability. `processingMs` is the same number returned to the
 * caller as `blueprint.buildDurationMs` — computed once, used for both.
 */
export interface BlueprintBuiltPayload {
  userId: string;
  entityId: string;
  entityType: 'blueprint';
  occurredAt: string;
  processingMs: number;
  artifactType: string;
}

// ── Conditional dispatch type ─────────────────────────────────────────────────

/**
 * Maps event type strings to their payload contract. Used by IntelligenceEventBus
 * to enforce type-safety on emit() and on() without a wrapper object.
 */
export type IntelligenceEventPayload<T extends IntelligenceEventType> =
  T extends 'intelligence.artifact.feedback'        ? FeedbackEventPayload :
  T extends 'intelligence.knowledge_asset.uploaded' ? KnowledgeAssetPayload :
  T extends 'intelligence.project.created'          ? ProjectPayload :
  T extends 'intelligence.project.updated'          ? ProjectPayload :
  T extends 'intelligence.user.correction'          ? UserCorrectionPayload :
  T extends 'intelligence.profile.updated'     ? ProfileUpdatedPayload :
  T extends 'intelligence.blueprint.built'     ? BlueprintBuiltPayload :
  T extends 'intelligence.conflict.recurring'  ? RecurringConflictPayload :
  T extends 'intelligence.learning.reviewed'   ? LearningReviewedPayload :
  BaseEventPayload;
