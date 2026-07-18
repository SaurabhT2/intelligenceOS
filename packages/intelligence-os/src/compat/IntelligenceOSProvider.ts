/**
 * IntelligenceOSProvider.ts
 *
 * Epic 2 (Platform Publication) — E2-4-T1.
 *
 * The platform's own implementation of IIntelligenceProvider (see
 * ../IIntelligenceProvider.ts for why that interface lives in this package
 * rather than in a consumer's contracts package).
 *
 * This is a thin adapter, not a reimplementation: every method delegates
 * directly to an `IntelligenceOS` instance the caller already constructed.
 * Its only job is to give a consumer something typed as `IIntelligenceProvider`
 * to register in their own dependency-injection container, instead of
 * depending on the concrete `IntelligenceOS` class. A consumer that doesn't
 * care about that distinction can use `IntelligenceOS` directly — both are
 * exported from index.ts.
 *
 * RULE-IOS-ISOLATION: like every file in this package, this adapter must
 * import only from within `@intelligence-os/core` and `@intelligence-os/shared-types`.
 * It must never import from a consumer's package — there is no consumer
 * package this platform depends on. Enforced by
 * scripts/check-boundaries.mjs (see ../../../scripts/check-boundaries.mjs);
 * see also AGENT_CONTEXT.md in this directory.
 */

import type {
  ArtifactRequest,
  ArtifactBlueprint,
  FeedbackEvent,
  IntelligenceSummary,
} from '@intelligence-os/shared-types';
import type { IIntelligenceProvider } from '../IIntelligenceProvider';
import type { ProjectInput, KnowledgeAssetInput, WorkspaceConfigurationInput, UserCorrectionInput } from '../types/domains';
import { IntelligenceOS, type IntelligenceOSConfig } from '../IntelligenceOS';

export class IntelligenceOSProvider implements IIntelligenceProvider {
  constructor(private readonly intelligenceOS: IntelligenceOS) {}

  /**
   * Convenience factory for consumers who only need the IIntelligenceProvider
   * surface and don't otherwise need direct access to the concrete
   * IntelligenceOS instance (e.g. its .domains or .eventBus). Equivalent to:
   *   new IntelligenceOSProvider(new IntelligenceOS(config))
   */
  static fromConfig(config: IntelligenceOSConfig): IntelligenceOSProvider {
    return new IntelligenceOSProvider(new IntelligenceOS(config));
  }

  /** Escape hatch back to the concrete instance — e.g. for .eventBus
   *  subscription, which is deliberately not part of IIntelligenceProvider. */
  get underlying(): IntelligenceOS {
    return this.intelligenceOS;
  }

  buildBlueprint(request: ArtifactRequest): Promise<ArtifactBlueprint> {
    return this.intelligenceOS.buildBlueprint(request);
  }

  recordFeedbackEvent(event: FeedbackEvent): Promise<void> {
    return this.intelligenceOS.recordFeedbackEvent(event);
  }

  ingestKnowledgeAsset(asset: KnowledgeAssetInput, rawContent = ''): Promise<string> {
    return this.intelligenceOS.ingestKnowledgeAsset(asset, rawContent);
  }

  ingestWorkspaceConfiguration(input: WorkspaceConfigurationInput): Promise<string> {
    return this.intelligenceOS.ingestWorkspaceConfiguration(input);
  }

  upsertProject(input: ProjectInput): Promise<string> {
    return this.intelligenceOS.upsertProject(input);
  }

  reviewLearning(
    userId: string,
    learningId: string,
    approved: boolean,
    reviewedBy: string,
  ): Promise<void> {
    return this.intelligenceOS.reviewLearning(userId, learningId, approved, reviewedBy);
  }

  getBrandSummary(params: { userId: string; workspaceId?: string }): Promise<IntelligenceSummary> {
    return this.intelligenceOS.getBrandSummary(params);
  }

  recordCorrection(input: UserCorrectionInput): Promise<void> {
    return this.intelligenceOS.recordCorrection(input);
  }
}
