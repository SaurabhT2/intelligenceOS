/**
 * BlueprintBuilder.ts
 *
 * Final assembly layer for blueprint generation.
 *
 * Blueprint generation must succeed for any valid ArtifactRequest, including:
 *   • A brand-new user with zero stored intelligence
 *   • A request with no projectId or workspaceId
 *   • An artifact type not in the 5 seeded universal patterns
 *
 * Assembly flow:
 *   1. Fetch intelligence in parallel (profile, archetype, project context,
 *      audience, workspace learnings) — each fetch is tracked (trackedCatch)
 *      so a real failure can be distinguished from legitimately absent data
 *   2. Plan structure (StructurePlanner)
 *   3. Plan narrative (NarrativePlanner)
 *   4. Detect conflicts (conflictDetection)
 *   5. Resolve conflicts (ConflictResolutionModel)
 *   6. Extract compliance requirements from workspace context
 *   7. Assemble ArtifactBlueprint with stable id, degraded flag,
 *      confidenceScore, and buildDurationMs (Epic 2 / E2-1-T1)
 *   8. Persist + emit event (both fire-and-forget — blueprint is returned even if either fails)
 *
 * Constraint: all intelligence access must go through domain APIs.
 * Direct Supabase queries are forbidden here.
 */

import type {
  ArtifactRequest,
  ArtifactBlueprint,
  ComplianceRequirement,
} from '@intelligence-os/shared-types';
import type { IntelligenceEventBus } from '../events/IntelligenceEventBus';
import type { UserIntelligenceDomain } from '../domains/UserIntelligenceDomain';
import type { ProjectIntelligenceDomain } from '../domains/ProjectIntelligenceDomain';
import type { ArtifactIntelligenceDomain } from '../domains/ArtifactIntelligenceDomain';
import type { KnowledgeIntelligenceDomain } from '../domains/KnowledgeIntelligenceDomain';
import type { WorkspaceIntelligenceDomain } from '../domains/WorkspaceIntelligenceDomain';
import type { WorkspaceContext, IntelligenceProfile } from '../types/entities';
import type { AudienceCalibration } from '@intelligence-os/shared-types';

import { ProjectContextBuilder } from './ProjectContextBuilder';
import { AudienceCalibrator } from './AudienceCalibrator';
import { StructurePlanner } from './StructurePlanner';
import { NarrativePlanner } from './NarrativePlanner';
import { ConflictResolutionModel } from './ConflictResolutionModel';
import { detectConflicts } from './internal/conflictDetection';
import { trackedCatch, skipped } from './internal/trackedFetch';

export type BlueprintBuilderDomains = {
  user:      UserIntelligenceDomain;
  project:   ProjectIntelligenceDomain;
  artifact:  ArtifactIntelligenceDomain;
  knowledge: KnowledgeIntelligenceDomain;
  workspace: WorkspaceIntelligenceDomain;
};

export class BlueprintBuilder {
  private readonly projectContextBuilder: ProjectContextBuilder;
  private readonly audienceCalibrator:    AudienceCalibrator;
  private readonly structurePlanner:      StructurePlanner;
  private readonly narrativePlanner:      NarrativePlanner;
  private readonly conflictResolution:    ConflictResolutionModel;

  constructor(
    private readonly domains: BlueprintBuilderDomains,
    private readonly bus:     IntelligenceEventBus,
  ) {
    this.projectContextBuilder = new ProjectContextBuilder(
      domains.project,
      domains.user,
      domains.workspace,
      domains.knowledge,
    );
    this.audienceCalibrator = new AudienceCalibrator(domains.user);
    this.structurePlanner   = new StructurePlanner(domains.artifact);
    this.narrativePlanner   = new NarrativePlanner();
    this.conflictResolution = new ConflictResolutionModel();
  }

  async build(request: ArtifactRequest): Promise<ArtifactBlueprint> {
    const startMs    = Date.now();
    const blueprintId = crypto.randomUUID();
    const now         = new Date();

    // ── Step 1: Fetch intelligence in parallel ────────────────────────────
    // All calls are tracked — partial intelligence is normal, but Epic 2's
    // `degraded` field needs to know whether a fallback fired because of an
    // actual error, not just because the data legitimately doesn't exist.
    const [
      profileResult,
      archetypeResult,
      projectContext,
      audienceResult,
      workspaceLearningsResult,
    ] = await Promise.all([
      trackedCatch(this.domains.user.getCurrentProfile(request.userId), null),
      trackedCatch(this.domains.user.getCurrentArchetype(request.userId), null),
      this.projectContextBuilder.build(
        request.userId,
        request.projectId,
        request.workspaceId,
      ),
      this.audienceCalibrator.calibrate(request.userId, request.audienceRef),
      // E1-2 Phase C: fetch workspace-level brand voice learnings when a
      // workspaceId is present. These carry inferred style signals shared
      // across all users in the workspace and take precedence over individual
      // user voice in the resolution hierarchy:
      //   workspace brand > user voice > archetype default > system default
      //
      // We fetch all workspace_intelligence learnings (ACTIVE/CONFIRMED/VALIDATED)
      // and let NarrativePlanner filter to voice-relevant taxonomy categories
      // (communication_style, writing_style, domain_specific_vocabulary).
      // Degrades gracefully to [] if no workspace or fetch fails.
      request.workspaceId
        ? trackedCatch(
            this.domains.workspace.getWorkspaceLearnings(request.workspaceId, 'workspace_intelligence'),
            [],
          )
        : skipped([]),
    ]);

    const profile             = profileResult.value;
    const archetype            = archetypeResult.value;
    const audienceCalibration = audienceResult.calibration;
    const workspaceLearnings  = workspaceLearningsResult.value;

    // Epic 2 / E2-1-T1: true only when an intelligence fetch actually
    // errored and fell back — never when data is simply, legitimately absent.
    const degraded =
      profileResult.failed ||
      archetypeResult.failed ||
      projectContext.degraded ||
      audienceResult.degraded ||
      workspaceLearningsResult.failed;

    // ── Step 2: Plan structure ────────────────────────────────────────────
    const structurePlan = await this.structurePlanner.plan(
      request.artifactType,
      request.userId,
      archetype?.archetypeType ?? null,
      audienceCalibration,
      projectContext,
    );

    // ── Step 3: Plan narrative ────────────────────────────────────────────
    const narrativePlan = this.narrativePlanner.plan(
      request.artifactType,
      profile,
      archetype,
      audienceCalibration,
      projectContext,
      workspaceLearnings,  // E1-2 Phase C: workspace brand voice layer
    );

    // ── Step 4: Detect conflicts ──────────────────────────────────────────
    const detectedConflicts = detectConflicts({
      profile,
      audienceCalibration,
      audienceProfile:  audienceResult.sourceProfile,
      project:          projectContext.project,
      workspaceContext: projectContext.workspaceContext,
    });

    // ── Step 5: Resolve conflicts ─────────────────────────────────────────
    const resolvedConflicts = this.conflictResolution.resolve(detectedConflicts);

    // ── Step 6: Extract compliance requirements ───────────────────────────
    const complianceRequirements = this.toComplianceRequirements(
      projectContext.workspaceContext,
    );

    // ── Step 7: Assemble blueprint ────────────────────────────────────────
    const buildDurationMs = Date.now() - startMs;
    const blueprint: ArtifactBlueprint = {
      id:                          blueprintId,
      userId:                      request.userId,
      artifactType:                request.artifactType,
      projectId:                   projectContext.project?.id ?? request.projectId ?? null,
      sections:                    structurePlan.sections,
      narrativeFrame:              narrativePlan.narrativeFrame,
      depthSpec:                   structurePlan.depthSpec,
      voiceDirectives:             narrativePlan.voiceDirectives,
      vocabularyDirectives:        narrativePlan.vocabularyDirectives,
      audienceCalibration,
      complianceRequirements,
      conflictsDetected:           detectedConflicts,
      conflictsResolved:           resolvedConflicts,
      intelligenceProfileVersion:  profile?.version ?? 0,
      createdAt:                   now,
      degraded,
      confidenceScore:             this.computeConfidenceScore(profile, audienceCalibration),
      buildDurationMs,
    };

    // ── Step 8: Persist and emit (fire-and-forget) ────────────────────────
    // Blueprint is returned to the caller even if persistence or emission fails.
    // Note: persistBlueprint() does not yet write degraded/confidenceScore/
    // buildDurationMs — artifact_blueprints has no columns for them yet
    // (see schema.sql and docs/IMPLEMENTATION_STATUS.md, "Known gaps").
    await Promise.allSettled([
      this.domains.artifact.persistBlueprint(blueprint),
      this.bus.emit('intelligence.blueprint.built', {
        userId:        request.userId,
        entityId:      blueprintId,
        entityType:    'blueprint',
        occurredAt:    now.toISOString(),
        processingMs:  buildDurationMs,
        artifactType:  request.artifactType,
      }),
    ]);

    return blueprint;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Epic 2 / E2-1-T1: a single 0–1 summary of how much stored intelligence
   * informed this blueprint, vs. how much relied on system defaults.
   *
   * Formula: 0.7 * profile.compositeConfidence (0 when no profile exists)
   *        + 0.3 * audienceCalibration.confidence
   * clamped to [0, 1]. Weighted toward the profile because it aggregates
   * many learnings; audience calibration is a single, narrower signal.
   * Deliberately independent of `degraded` — see ArtifactBlueprint docblock.
   */
  private computeConfidenceScore(
    profile:             IntelligenceProfile | null,
    audienceCalibration: AudienceCalibration,
  ): number {
    const profileConfidence = profile?.compositeConfidence ?? 0;
    const raw = 0.7 * profileConfidence + 0.3 * audienceCalibration.confidence;
    return Math.min(1, Math.max(0, raw));
  }

  private toComplianceRequirements(
    workspaceContext: WorkspaceContext | null,
  ): ComplianceRequirement[] {
    if (!workspaceContext || workspaceContext.complianceConstraints.length === 0) {
      return [];
    }
    return workspaceContext.complianceConstraints.map((constraint, index) => ({
      id:          crypto.randomUUID(),
      description: (constraint['description'] as string) ??
                   `Compliance requirement ${index + 1}`,
      isMandatory: (constraint['mandatory'] as boolean) ?? true,
      constraintType:  constraint['type'],
      requirement: constraint['requirement'],
    }));
  }
}
