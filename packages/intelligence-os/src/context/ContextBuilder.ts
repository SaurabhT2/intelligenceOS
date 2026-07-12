/**
 * ContextBuilder.ts
 *
 * Milestone 2 (CognitionProvider integration layer), generalized by
 * ADR-003 (Subject-Centric Intelligence).
 *
 * The terminal module responsible for assembling one immutable
 * `CognitionContext` for a workspace, per
 * `PLATFORM_CONTRACT.md` §3 ("Context Building → the
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
 * ── `identity`, as of ADR-003 (was unconditionally `null`) ────────────────
 * Milestone 2 returned `identity: null` unconditionally, with a documented
 * rationale: Epic 2's identity/archetype resolution
 * (`UserIntelligenceDomain.getCurrentArchetype`) is User-scoped, and this
 * builder has no honest `userId` to resolve it against. ADR-003 §2.3
 * resolves this not by reaching for a User after all, but by generalizing
 * the *source*: the Workspace is now itself a first-class Subject
 * (`types/subject.ts`) that accumulates its own Learnings via the same
 * Learning Pipeline a User does (`SignalExtractor.extractFromObservation`
 * → ... → `ProfileBuilder.rebuildForSubject`). `identity` below is
 * synthesized from exactly those Learnings (`identitySynthesis.ts`),
 * still without fabricating a User this contract was never given. A
 * Workspace with no identity-relevant Learnings yet still legitimately
 * gets `identity: null` — the honest "nothing learned yet" state, now
 * conditional on that being true rather than unconditional. See
 * `identitySynthesis.ts`'s own docblock for the full reasoning, including
 * why a contributing User's profile is still not composed in (the
 * contract carries no `userId` to identify one).
 *
 * `visualIdentity` remains `null` unconditionally — no Learning Pipeline
 * path produces visual-feature Learnings yet (`ADR-001` §5's
 * `VisualFeatureExtractor` is unbuilt), so there is nothing ADR-003
 * generalizes here; this is an unrelated, still-open gap.
 */

import type { CognitionContext } from '@platform/cognition-contract';
import { COGNITION_CONTRACT_VERSION } from '@platform/cognition-contract';
import type { VoiceProfile, IdentityContribution } from '@platform/cognition-contract';
import type { WorkspaceIntelligenceDomain } from '../domains/WorkspaceIntelligenceDomain';
import {
  deriveVoiceProfile,
  deriveConfidence,
  deriveLastConsolidatedAt,
} from './voiceMapping';
import { deriveIdentityContribution } from './identitySynthesis';

/**
 * ADR-003 §2.4 — applies explicit, admin-declared voice configuration
 * (Knowledge — non-decaying, provenance-carrying) on top of the
 * Learning-derived voice profile (Experience — corroborated, decaying).
 * Knowledge wins on every field it declares; fields it doesn't declare
 * fall through to the Learning-derived value unchanged. This mirrors
 * `NarrativePlanner`'s authority ordering
 * (`USER_ESTABLISHED_PATTERN` < `WORKSPACE_COMPLIANCE`, ARCHITECTURE.md
 * §10) applied one layer up: an explicit workspace declaration outranks
 * an inferred pattern the same way a workspace compliance requirement
 * outranks a user's usual voice.
 */
function applyVoiceConfiguration(
  base: VoiceProfile,
  voiceConfiguration: Record<string, unknown> | null,
): VoiceProfile {
  if (!voiceConfiguration) return base;

  const isCadence = (v: unknown): v is VoiceProfile['cadence'] =>
    v === 'short' || v === 'medium' || v === 'long' || v === 'varied';

  return {
    tone: typeof voiceConfiguration['tone'] === 'string' ? voiceConfiguration['tone'] : base.tone,
    cadence: isCadence(voiceConfiguration['cadence']) ? voiceConfiguration['cadence'] : base.cadence,
    audienceType:
      typeof voiceConfiguration['audienceType'] === 'string' ? voiceConfiguration['audienceType'] : base.audienceType,
    executiveLevel:
      typeof voiceConfiguration['executiveLevel'] === 'boolean'
        ? voiceConfiguration['executiveLevel']
        : base.executiveLevel,
    domain: typeof voiceConfiguration['domain'] === 'string' ? voiceConfiguration['domain'] : base.domain,
    bannedPhrases: Array.isArray(voiceConfiguration['bannedPhrases'])
      ? (voiceConfiguration['bannedPhrases'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : base.bannedPhrases,
    ...(typeof voiceConfiguration['brandName'] === 'string'
      ? { brandName: voiceConfiguration['brandName'] as string }
      : base.brandName
        ? { brandName: base.brandName }
        : {}),
    ...(typeof voiceConfiguration['voiceDescriptor'] === 'string'
      ? { voiceDescriptor: voiceConfiguration['voiceDescriptor'] as string }
      : base.voiceDescriptor
        ? { voiceDescriptor: base.voiceDescriptor }
        : {}),
    ...(typeof voiceConfiguration['audiencePositioning'] === 'string'
      ? { audiencePositioning: voiceConfiguration['audiencePositioning'] as string }
      : base.audiencePositioning
        ? { audiencePositioning: base.audiencePositioning }
        : {}),
  };
}

/**
 * ADR-003 §2.3/§2.4 — applies explicit, admin-declared identity
 * declarations (Knowledge — non-decaying, provenance-carrying) on top of
 * the Learning-derived identity contribution (Experience — corroborated,
 * decaying). Closes Completion Mission audit finding D-3: prior to this,
 * `identity` was synthesized from Learnings only, despite §2.3's own text
 * naming Knowledge and Experience as identity's two inputs. Mirrors
 * `applyVoiceConfiguration()` above exactly — same authority relationship,
 * same field-level fallthrough, applied to `identity` instead of `voice`.
 */
function applyIdentityConfiguration(
  base: IdentityContribution | null,
  identityConfiguration: Record<string, unknown> | null,
): IdentityContribution | null {
  if (!identityConfiguration) return base;

  const asString = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
  const asStringArray = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const strs = v.filter((x): x is string => typeof x === 'string');
    return strs.length > 0 ? strs : undefined;
  };
  const isPreferredLength = (v: unknown): v is IdentityContribution['preferredLength'] =>
    v === 'short' || v === 'medium' || v === 'long';

  const brandName = asString(identityConfiguration['brandName']);
  const narrativeArcs = asStringArray(identityConfiguration['narrativeArcs']);
  const argumentationStyle = asString(identityConfiguration['argumentationStyle']);
  const namedFrameworks = asStringArray(identityConfiguration['namedFrameworks']);
  const preferredLength = isPreferredLength(identityConfiguration['preferredLength'])
    ? identityConfiguration['preferredLength']
    : undefined;

  // No base identity (no identity-relevant Learnings yet) and no
  // configuration field actually populates anything: stay honestly null
  // rather than returning an all-default shell — same discipline
  // `deriveIdentityContribution()` itself already applies.
  if (
    !base &&
    brandName === undefined &&
    narrativeArcs === undefined &&
    argumentationStyle === undefined &&
    namedFrameworks === undefined &&
    preferredLength === undefined
  ) {
    return null;
  }

  return {
    brandName: brandName ?? base?.brandName ?? null,
    narrativeArcs: narrativeArcs ?? base?.narrativeArcs ?? [],
    argumentationStyle: argumentationStyle ?? base?.argumentationStyle ?? null,
    namedFrameworks: namedFrameworks ?? base?.namedFrameworks ?? [],
    preferredLength: preferredLength ?? base?.preferredLength ?? 'medium',
  };
}

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
   * documented for `resolveCognitionContext` in PLATFORM_CONTRACT.md
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
    const [learnings, workspaceContext] = await Promise.all([
      this.workspace.getWorkspaceLearnings(workspaceId),
      this.workspace.getContext(workspaceId),
    ]);

    const voice = applyVoiceConfiguration(deriveVoiceProfile(learnings), workspaceContext.voiceConfiguration);

    return {
      contractVersion: COGNITION_CONTRACT_VERSION,
      workspaceId,
      resolvedAt: new Date().toISOString(),
      confidence: deriveConfidence(learnings),
      voice,
      // ADR-003 (Subject-Centric Intelligence) §2.3 — see this file's
      // header docblock for why this is no longer unconditionally null.
      // Knowledge-sourced identityConfiguration (explicit declaration)
      // applied ahead of Learning-derived identity, same authority
      // relationship `voiceConfiguration` already has with voice above —
      // closes Completion Mission audit finding D-3.
      identity: applyIdentityConfiguration(deriveIdentityContribution(learnings), workspaceContext.identityConfiguration),
      visualIdentity: null,
      provenance: {
        signalCount: learnings.length,
        lastConsolidatedAt: deriveLastConsolidatedAt(learnings),
      },
    };
  }
}
