/**
 * ContextBuilder.ts
 *
 * Milestone 2 (CognitionProvider integration layer).
 *
 * The terminal module responsible for assembling one immutable
 * `CognitionContext` for a workspace, per
 * `INTELLIGENCE_PLATFORM_IMPLEMENTATION.md` §3 ("Context Building → the
 * terminal module... the only module permitted to call across cognition/,
 * memory/, knowledge/, and blueprint/ to assemble a single CognitionContext").
 *
 * ── Scoping note (read before modifying) ───────────────────────────────────
 * `CognitionRequest` — and every other CognitionProvider input — is scoped
 * by `workspaceId` only; it carries no `userId`. Epic 2's domain layer is,
 * with one exception, scoped by `userId` (optionally narrowed by
 * `workspaceId`): `UserIntelligenceDomain.getCurrentProfile`,
 * `getCurrentArchetype`, `BlueprintBuilder.build` (via `ArtifactRequest`)
 * all require a `userId` this contract does not provide.
 *
 * The one exception is `WorkspaceIntelligenceDomain`, which already exposes
 * genuinely workspace-scoped, no-userId-required reads:
 * `getWorkspaceLearnings(workspaceId)` and `getContext(workspaceId)`
 * (E1-2 Phase B — "workspace-scoped brand voice"). This builder is
 * deliberately built ONLY on top of that domain, for two reasons:
 *   1. It is the only Epic 2 primitive that actually matches the contract's
 *      scoping, without fabricating a synthetic/sentinel userId.
 *   2. Per the approved Milestone 2 direction, the CognitionProvider
 *      contract is not being modified to add a userId — so any workspace
 *      request this builder receives may genuinely have no associated user
 *      at all (e.g. a workspace with multiple contributors and no single
 *      "owning" user).
 *
 * Consequence, stated plainly rather than papered over: `identity` and
 * `visualIdentity` are returned as `null` in this Milestone 2
 * implementation. Epic 2 has real identity/archetype resolution
 * (`UserIntelligenceDomain.getCurrentArchetype`) and real visual-feature
 * extraction (`knowledge/VisualFeatureExtractor`), but both are scoped in a
 * way this builder cannot honestly reach from a `workspaceId` alone without
 * either (a) inventing a workspace→user resolution IntelligenceOS does not
 * yet have, or (b) guessing. `identity: null` / `visualIdentity: null` are
 * legitimate contract values — COGNITION_CONTRACT_SPEC.md §4 describes
 * Confidence as the signal for "how much the rest of the context should be
 * trusted," and `null` here is the honest answer, not a shortcut. See the
 * Milestone 2 report, "Known Limitations," for the follow-up this implies.
 */

import type { CognitionContext } from '@platform/cognition-contract';
import { COGNITION_CONTRACT_VERSION } from '@platform/cognition-contract';
import type { WorkspaceIntelligenceDomain } from '../domains/WorkspaceIntelligenceDomain';
import {
  deriveVoiceProfile,
  deriveConfidence,
  deriveLastConsolidatedAt,
} from './voiceMapping';

export class ContextBuilder {
  constructor(private readonly workspace: WorkspaceIntelligenceDomain) {}

  /**
   * Assembles the complete, immutable CognitionContext for a workspace.
   * Never throws for "nothing learned yet" — that is the normal, expected
   * state for a new workspace and resolves to a low-but-complete context
   * (mirrors BlueprintBuilder's "never fail for missing data" convention).
   * A genuine fetch failure (DatabaseError from the domain layer) is left
   * to propagate — the CognitionProvider adapter (api/) is responsible for
   * converting that into the contract's fallback behavior, exactly as
   * documented for `resolveCognitionContext` in COGNITION_CONTRACT_SPEC.md
   * §3 ("a caller either receives a complete context ... or an explicit
   * failure").
   *
   * @param workspaceId required — the sole scoping key this contract provides.
   * @param _taskType currently unused. Reserved: per-taskType voice/identity
   *   projection is plausible future work (e.g. a different bannedPhrases
   *   set per artifact type) but nothing in Epic 2 today varies workspace
   *   learnings by taskType, so honoring it now would be inventing behavior
   *   rather than reusing it. Accepted on the signature to keep it available
   *   without a future contract-shape change.
   */
  async build(workspaceId: string, _taskType?: string): Promise<CognitionContext> {
    const learnings = await this.workspace.getWorkspaceLearnings(workspaceId);

    return {
      contractVersion: COGNITION_CONTRACT_VERSION,
      workspaceId,
      resolvedAt: new Date().toISOString(),
      confidence: deriveConfidence(learnings),
      voice: deriveVoiceProfile(learnings),
      identity: null,
      visualIdentity: null,
      provenance: {
        signalCount: learnings.length,
        lastConsolidatedAt: deriveLastConsolidatedAt(learnings),
      },
    };
  }
}
