/**
 * E2-1-T3.artifactTypeOpenness.test.ts
 *
 * Epic 2 (Platform Publication) — E2-1-T3 spike finding.
 *
 * Original question (Roadmap E2-1-T3, BrandOS-coupled framing): "does
 * BrandOS's ArtifactType/TaskType domain vocabulary need a translation
 * layer against Intelligence OS's ArtifactType union?" Epic 2 reframes
 * this: Intelligence OS cannot special-case any one consumer's vocabulary
 * (BrandOS's or anyone else's) without reintroducing the coupling Epic 2
 * exists to remove. The platform-side question that actually matters is:
 * "what happens when ANY consumer passes an artifactType string the
 * platform has no seeded pattern for?"
 *
 * Finding: nothing breaks. `ArtifactRequest.artifactType` is already an
 * open union (`ArtifactType = 'board_update' | ... | (string & {})` —
 * see ArtifactRequest.ts), and both StructurePlanner and NarrativePlanner
 * already have documented, tested fallback paths for any unrecognized
 * value:
 *   - StructurePlanner.plan() → ArtifactIntelligenceDomain.getPattern()
 *     returns null for an unseeded type → FALLBACK_SECTIONS (3 generic
 *     sections), never throws (already covered by the 'unknown_type' case
 *     in tests/unit/blueprint/StructurePlanner.test.ts).
 *   - NarrativePlanner.plan() → getNarrativeFrame() has no entry in
 *     NARRATIVE_FRAME_LOOKUP for an unseeded type → a generic
 *     opening/argumentStructure built from the type string itself (already
 *     covered by the 'custom_doc_type' case in
 *     tests/unit/blueprint/NarrativePlanner.test.ts).
 *
 * This test adds nothing structurally new to those two suites — it exists
 * to record the spike's conclusion against vocabulary an actual external
 * consumer would plausibly send (e.g. a social-media scheduling tool's
 * 'carousel' / 'caption' / 'deck'), rather than the placeholder names
 * ('unknown_type', 'custom_doc_type') used to prove the mechanism elsewhere.
 * No remediation needed: the platform boundary already holds without a
 * translation layer. Per Epic 2's "do not require consumer source" rule,
 * Intelligence OS does not — and should not — enumerate any consumer's
 * specific artifact-type vocabulary.
 */
import { describe, it, expect, vi } from 'vitest';
import { BlueprintBuilder } from '../../../src/blueprint/BlueprintBuilder';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import type { ArtifactRequest } from '@intelligence-os/shared-types';

function createMockDomains() {
  return {
    user: {
      getCurrentProfile:         vi.fn().mockResolvedValue(null),
      getCurrentArchetype:       vi.fn().mockResolvedValue(null),
      getActiveLearnings:        vi.fn().mockResolvedValue([]),
      getGenericAudienceProfile: vi.fn().mockResolvedValue(null),
    },
    project: { getProject: vi.fn().mockResolvedValue(null) },
    artifact: {
      getPattern:       vi.fn().mockResolvedValue(null), // no consumer's vocabulary is seeded
      persistBlueprint: vi.fn().mockResolvedValue(undefined),
    },
    knowledge: { getAssets: vi.fn().mockResolvedValue([]) },
    workspace: {
      getContext:            vi.fn().mockResolvedValue(null),
      getWorkspaceLearnings: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('Epic 2 / E2-1-T3 — unrecognized artifactType strings never break assembly', () => {
  it.each(['carousel', 'caption', 'deck', 'reel_script', 'press_release'])(
    'builds a complete, non-degraded blueprint for artifactType=%s with no seeded pattern',
    async (artifactType) => {
      const builder = new BlueprintBuilder(createMockDomains() as any, new InProcessEventBus());
      const request: ArtifactRequest = { userId: 'u1', artifactType };

      const blueprint = await builder.build(request);

      expect(blueprint.artifactType).toBe(artifactType);
      expect(blueprint.sections.length).toBeGreaterThan(0);
      expect(blueprint.narrativeFrame.opening).toBeTruthy();
      expect(blueprint.narrativeFrame.argumentStructure).toBeTruthy();
      // An unseeded type is absence-of-data, not a fetch failure.
      expect(blueprint.degraded).toBe(false);
    },
  );
});
