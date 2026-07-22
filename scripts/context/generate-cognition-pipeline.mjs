#!/usr/bin/env node
import { join } from 'node:path';
import { buildRepoModel, REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from './lib/analyzer.mjs';
import { renderPipelineDoc } from './lib/pipeline-doc.mjs';

const STAGES = [
  { name: 'Explain', file: 'api/CognitionProviderImpl.ts', note: '`summarizeCognition(workspaceId)` — `GET /v1/cognition/summary`. Explains the current state of a workspace\'s cognition (a human/agent-readable summary), distinct from `resolveCognitionContext` which returns the machine-consumed context.' },
  { name: 'Resolve Context', file: 'api/CognitionProviderImpl.ts', note: '`resolveCognitionContext(request)` — `POST /v1/cognition/resolve`. The main request path: resolves a `CognitionRequest` down to a full `CognitionContext` via `ContextBuilder`.' },
  { name: 'Observe', file: 'api/CognitionProviderImpl.ts', note: '`observe(input)` — `POST /v1/cognition/observe`. Entry point into the Learning Pipeline\'s Observation stage for workspace-scoped subjects.' },
  { name: 'Review', file: 'api/CognitionProviderImpl.ts', note: '`review(decision)` — `POST /v1/cognition/review`. Supervisory review of a flagged Learning; corresponds to `intelligence.learning.reviewed`.' },
  { name: 'Knowledge Ingest', file: 'IntelligenceOS.ts', note: '`ingestKnowledgeAsset(asset, rawContent?)` — `POST /v1/knowledge/ingest`. Entry point into the Knowledge Pipeline.' },
  { name: 'Correction', file: 'IntelligenceOS.ts', note: '`recordCorrection(input)` — `POST /v1/intelligence/correction`. Alternate entry into the Learning Pipeline\'s Observation stage, for explicit user corrections rather than passive feedback.' },
  { name: 'Workspace Configuration', file: 'IntelligenceOS.ts', note: '`ingestWorkspaceConfiguration(input)` — `POST /v1/workspace-configuration`. Persists admin-declared voice/identity/compliance overrides as Knowledge, read back by `ContextBuilder` ahead of Learning-derived identity (ADR-003 §2.4).' },
];

export function generate(model) {
  return renderPipelineDoc(model, {
    title: 'Cognition Pipeline',
    headerNote: GENERATED_HEADER_NOTE,
    intro:
      'The end-to-end request pipeline exposed over HTTP: Explain, Resolve Context, Observe, Review, ' +
      'Knowledge Ingest, Correction, Workspace Configuration. All routes are hosted by ' +
      '`packages/intelligence-os/src/api/http/server.ts` — see `.context/api_contract.generated.md` for ' +
      'the full route table.',
    stages: STAGES,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeGenerated(join(REPO_ROOT, '.context', 'cognition_pipeline.generated.md'), generate(model));
  console.log('✅ .context/cognition_pipeline.generated.md');
}
