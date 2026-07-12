/**
 * ArtifactBlueprint.ts
 *
 * The handoff type returned by `IntelligenceOS.buildBlueprint()`.
 * Source: BrandOS_IntelligenceOS_Architecture.md, Section 8.
 *
 * Sub-type provenance (see Sprint 0 readiness review for full discussion):
 *  - BlueprintSection, VoiceDirectives, VocabularyDirectives: fully specified
 *    in the Architecture doc verbatim.
 *  - AudienceCalibration, DetectedConflict, ConflictResolution: not given as
 *    literal TypeScript anywhere, but derived from BrandOS_Logical_Intelligence_Schema.md
 *    (Audience Profile B.14, Conflict Model Section J) plus the field names
 *    actually used in this doc's own ConflictResolutionModel pseudocode
 *    (Section 6). These are real shapes, not placeholders.
 *  - NarrativeFrame, DepthSpecification, ComplianceRequirement, VocabularyChange:
 *    referenced by name only, in no document. Typed as explicit placeholders
 *    per approval — replace when Narrative Planner / Blueprint Builder /
 *    Conflict Resolution Model land in Sprint 1, not before.
 *
 * Epic 2 (Platform Publication) addition — degraded / confidenceScore /
 * buildDurationMs:
 *  This is the platform's one and only public result type for blueprint
 *  generation. There is no separate consumer-side "ArtifactBlueprintResult"
 *  alias — Epic 2 considered defining one in a consumer's own contracts
 *  package, then rejected it: maintaining two parallel definitions of the
 *  same object across a package boundary is exactly the kind of drift this
 *  type was already written to avoid (see the cite above re: BrandOS never
 *  importing from `intelligence-os/src/types/*` directly). Extending the
 *  real type in place keeps a single source of truth.
 *
 *  - `degraded`: true when one or more of the Step-1 intelligence fetches
 *    in BlueprintBuilder.build() (profile, archetype, project context,
 *    audience calibration, workspace learnings) errored and fell back to
 *    its `.catch()` default. This is **not** the same condition as a
 *    brand-new user simply having no stored profile yet — that is expected,
 *    normal, and does not set this flag. `degraded` exists so a consumer
 *    can distinguish "the system correctly used defaults because there's
 *    nothing stored yet" from "something errored and we covered for it";
 *    the former needs no action, the latter may warrant a retry or a log line.
 *  - `confidenceScore`: a single 0–1 number summarizing how much stored
 *    intelligence informed this blueprint, derived from
 *    `profile.compositeConfidence` (weight 0.7, 0 when no profile exists)
 *    and `audienceCalibration.confidence` (weight 0.3). Deliberately not
 *    reduced when `degraded` is true — degradation and confidence answer
 *    different questions, and folding one into the other would make
 *    neither legible. See BlueprintBuilder.computeConfidenceScore().
 *  - `buildDurationMs`: wall-clock time for the full `build()` call, in
 *    milliseconds. Mirrors the `processingMs` already emitted on the
 *    `intelligence.blueprint.built` event, computed once and reused for both.
 *
 *  Not yet persisted: `artifact_blueprints` has no columns for these three
 *  fields yet (see schema.sql) — same deferred treatment already given to
 *  `quality_score` there. Returned to the caller; not yet in the audit trail.
 *  Tracked as a documented gap, not silently dropped — see
 *  docs/IMPLEMENTATION_STATUS.md.
 */

import type { ArtifactType } from './ArtifactRequest';

export interface ArtifactBlueprint {
  id: string;
  userId: string;
  artifactType: ArtifactType;
  projectId: string | null;
  sections: BlueprintSection[];
  narrativeFrame: NarrativeFrame;
  depthSpec: DepthSpecification;
  voiceDirectives: VoiceDirectives;
  vocabularyDirectives: VocabularyDirectives;
  audienceCalibration: AudienceCalibration;
  complianceRequirements: ComplianceRequirement[];
  conflictsDetected: DetectedConflict[];
  conflictsResolved: ConflictResolution[];
  intelligenceProfileVersion: number;
  createdAt: Date;
  /** true when this blueprint was assembled with one or more intelligence
   *  fetches degraded to a fail-soft fallback. See class docblock above. */
  degraded: boolean;
  /** 0–1. How much stored intelligence informed this blueprint. */
  confidenceScore: number;
  /** Wall-clock duration of the build() call, in milliseconds. */
  buildDurationMs: number;
}

export interface BlueprintSection {
  id: string;
  title: string;
  purpose: string;
  depthLevel: 'summary' | 'standard' | 'deep';
  wordCountMin?: number;
  wordCountMax?: number;
  subsections?: BlueprintSection[];
  evidenceType?: 'data' | 'narrative' | 'example' | 'mixed';
}

export interface VoiceDirectives {
  register: 'formal' | 'professional' | 'conversational' | 'technical';
  /** e.g. ['authoritative', 'concise', 'data-led'] */
  tone: string[];
  sentenceRhythm: 'short' | 'mixed' | 'long';
  paragraphStyle: 'dense' | 'airy';
  /** known rejection vocabulary */
  avoidPatterns: string[];
}

export interface VocabularyDirectives {
  /** e.g. 'growth metric' -> 'net revenue retention' */
  preferredTerms: Record<string, string>;
  forbiddenTerms: string[];
  /** expected industry vocabulary */
  domainJargon: string[];
  /** from Knowledge Assets */
  proprietaryTerms: string[];
}

/**
 * Derived from Logical Intelligence Schema B.14 (Audience Profile) and
 * ArtifactRequest's AudienceReference. Phase 1 only ever populates the
 * generic path (audienceType, isNamedRelationship: false) — Logical Schema
 * K.2 / Contracts J.2: named Relationship calibration is a Phase 2
 * activation. The shape supports both so Sprint 1's AudienceCalibrator
 * doesn't need a breaking change when Relationship Intelligence activates.
 */
export interface AudienceCalibration {
  isNamedRelationship: boolean;
  /** populated when isNamedRelationship is true (Phase 2) */
  relationshipId?: string;
  audienceType?: 'board' | 'investor' | 'engineering' | 'customer' | 'general';
  expertiseLevel: 'expert' | 'practitioner' | 'informed' | 'general';
  communicationNorms: Record<string, unknown>;
  knownSensitivities: Record<string, unknown>;
  confidence: number;
}

/**
 * Derived from Logical Intelligence Schema, Conflict Model (Section J), and
 * this doc's own ConflictResolutionModel pseudocode in Section 6, which
 * accesses `conflict.id` and `conflict.departure.isSignificant` directly —
 * those field names are taken as authoritative over an independent guess.
 */
export interface DetectedConflict {
  id: string;
  conflictType: string;
  entityAType: string;
  entityAId: string;
  entityBType: string;
  entityBId: string;
  authorityLevelA: number;
  authorityLevelB: number;
  departure: {
    isSignificant: boolean;
    description?: string;
  };
}

/**
 * Field names (conflictId, rule, winner, departure, transparency) match
 * this doc's own ConflictResolutionModel pseudocode exactly:
 * `resolutions.push({ conflictId, rule: 'RECIPIENT', winner: 'audience', departure, transparency })`
 */
export interface ConflictResolution {
  conflictId: string;
  rule: string;
  winner: string;
  departure: {
    isSignificant: boolean;
    description?: string;
  };
  /**
   * Human-readable note surfaced to the user when a significant departure
   * occurs (Transparency Rule). null when departure.isSignificant is false.
   * Source: ConflictResolutionModel pseudocode, Architecture Section 6.2.
   */
  transparency: string | null;
}

/**
 * PLACEHOLDER — referenced by name in Architecture Section 8
 * (`blueprint.narrativeFrame.opening` / `.argumentStructure` per usage
 * elsewhere in that doc) but never given a full shape in any of the five
 * source documents. Owned by Narrative Planner (Sprint 1). Replace this
 * shape, don't just extend it, once Narrative Planner is built.
 */
export interface NarrativeFrame {
  opening: string;
  argumentStructure: string;
  closing?: string;
  /** escape hatch until Narrative Planner defines the real shape */
  [key: string]: unknown;
}

/**
 * PLACEHOLDER — referenced by name only. Owned by Structure Planner /
 * Blueprint Builder (Sprint 1).
 */
export interface DepthSpecification {
  level: 'summary' | 'standard' | 'deep';
  [key: string]: unknown;
}

/**
 * PLACEHOLDER — referenced by name only. Owned by Conflict Resolution
 * Model / Workspace Intelligence (Phase 2 for the full workspace
 * governance case; Sprint 1 for any Phase-1 compliance constraint that
 * already exists on a project).
 */
export interface ComplianceRequirement {
  id: string;
  description: string;
  isMandatory: boolean;
  [key: string]: unknown;
}
