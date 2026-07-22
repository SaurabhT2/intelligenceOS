#!/usr/bin/env node
import { join } from 'node:path';
import { buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE, findFile } from './lib/analyzer.mjs';
import { renderPipelineDoc } from './lib/pipeline-doc.mjs';

const STAGES = [
  { name: 'Identity derivation', file: 'context/identitySynthesis.ts', note: '`deriveIdentityContribution(learnings)` — turns confirmed Learnings into an `IdentityContribution`, or `null` if nothing has been learned yet (the deliberate "honest null" state per `ContextBuilder.ts`\'s own header doc). As of ADR-005 (Evidence/Identity Bridge), those Learnings can now originate from Knowledge assets too — see `pipeline/EvidenceExtractor.ts` and `knowledge/KnowledgeAssetEvidenceAdapter.ts` — not only from feedback/observation evidence; `identitySynthesis.ts` itself is unchanged and unaware of which source produced a given Learning.' },
  { name: 'Voice', file: 'context/voiceMapping.ts', note: '`deriveVoiceProfile(learnings)` — maps Learnings to a `VoiceProfile`. Same file also derives `deriveConfidence` and `deriveLastConsolidatedAt`.' },
  { name: 'Reasoning', file: 'context/ContextBuilder.ts', note: 'Computed inline in `ContextBuilder.build()` (the `reasoning:` field) by projecting the Profile\'s reasoning-pattern collection through `projectByAscendingConfidence` — there is no standalone `reasoning*.ts` module; it lives directly in the builder.' },
  { name: 'Positioning', file: 'context/ContextBuilder.ts', note: 'Same pattern as Reasoning — computed inline (`positioning:` field) via the same generic projection helper.' },
  { name: 'Audience', file: 'blueprint/AudienceCalibrator.ts', note: 'Audience calibration is a Blueprint-time concern (per-request, given a named recipient) rather than a Context-time one — see `AudienceCalibration.isNamedRelationship` referenced from `ArtifactIntelligenceDomain.countArtifactsWithNamedRecipients`.' },
  { name: 'Confidence', file: 'context/voiceMapping.ts', note: '`deriveConfidence(learnings)` — the top-level `CognitionConfidence` on the assembled context; per-section confidence (identity/voice/reasoning/positioning) is derived independently per section via `projectByAscendingConfidence`, not copied from this top-level value.' },
  { name: 'Knowledge Summary', file: 'knowledge/KnowledgeProcessor.ts', note: 'Knowledge assets contribute through `KnowledgeIntelligenceDomain` → `ContextBuilder`, which reads workspace-declared configuration ahead of Learning-derived identity/voice (ADR-003 §2.4 precedence rule). This is the *descriptive* path — distinct from the *evidentiary* path (this stage above, "Identity derivation") that ADR-005 added.' },
  { name: 'Visual Identity', file: 'context/ContextBuilder.ts', note: 'Currently hard-coded to `null` in `ContextBuilder.build()` (`visualIdentity: null`) — there is no visual-identity contributor implemented yet. This is a genuine gap, not a missed cross-reference; see the "Repository Health" section of `architecture.generated.md`.' },
];

export function generate(model) {
  const doc = renderPipelineDoc(model, {
    title: 'Identity Pipeline',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'Identity derivation, and every field `ContextBuilder` assembles alongside it: Voice, Reasoning, ' +
      'Positioning, Audience, Confidence, Knowledge Summary, Visual Identity. Several of these are not ' +
      'separate modules — they are inline projections inside `ContextBuilder.build()` itself, which this ' +
      'doc calls out explicitly rather than inventing a module that doesn\'t exist.',
    stages: STAGES,
  });
  return doc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'identity_pipeline.generated.md'), generate(model));
  console.log('✅ .context/identity_pipeline.generated.md');
}
