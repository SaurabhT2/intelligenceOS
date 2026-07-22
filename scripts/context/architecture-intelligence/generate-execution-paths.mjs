#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph, idField } from '../lib/graph.mjs';

// The mission's own example (POST /v1/knowledge/ingest → ... → Prompt) spans
// a mix of real CALLS edges (route → handler) and event-bus-mediated /
// caller-orchestrated handoffs the CALLS graph doesn't connect directly
// (see pipeline_relationships.generated.md for why). Each route below gets
// BOTH the graph-derived reachability AND the curated narrative chain, with
// the graph-derived part clearly separated so nothing is silently asserted.
const NARRATIVE_CHAINS = {
  'POST /v1/knowledge/ingest': [
    'HTTP: POST /v1/knowledge/ingest',
    'IntelligenceOS.ingestKnowledgeAsset()',
    'KnowledgeIntelligenceDomain (persist raw asset)',
    'KnowledgeProcessor.process() (event-bus-triggered by intelligence.knowledge_asset.uploaded)',
    'VocabularyExtractor / FrameworkExtractor / PatternExtractor / VisualFeatureExtractor',
    'KnowledgeValidator',
    'KnowledgeIntelligenceDomain (persist extracted knowledge)',
    'ProfileBuilder.rebuildForSubject() (next profile rebuild picks up the new knowledge)',
    'ContextBuilder.build() → CognitionContext.knowledge',
    'Prompt / artifact-generation consumer (outside this repo — IntelligenceOS ends at the resolved CognitionContext)',
  ],
  'POST /v1/cognition/resolve': [
    'HTTP: POST /v1/cognition/resolve',
    'CognitionProviderImpl.resolveCognitionContext()',
    'ContextBuilder.build()',
    'UserIntelligenceDomain.getCurrentProfileForSubject() (read current IntelligenceProfile)',
    'voiceMapping.ts / identitySynthesis.ts (derive voice/identity/confidence from Learnings)',
    'CognitionContext (returned to caller)',
  ],
  'POST /v1/intelligence/correction': [
    'HTTP: POST /v1/intelligence/correction',
    'IntelligenceOS.recordCorrection()',
    'ObservationBuilder (build Observation from correction input)',
    'SignalExtractor (event-bus-triggered)',
    'HypothesisEngine',
    'LearningValidator → intelligence.learning.validated',
    'ProfileBuilder.rebuildForSubject() → intelligence.profile.updated',
  ],
};

export function generate() {
  const g = buildArchitectureGraph();
  const lines = [];
  lines.push('# Execution Paths');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'For every HTTP route: the graph-derived CALLS-reachability set (mechanical, from ' +
    '`architecture_knowledge_graph.generated.json`), then — for the three routes the mission calls out ' +
    'by name — a curated end-to-end narrative chain that fills in the event-bus-mediated hops the CALLS ' +
    'graph doesn\'t connect directly. The curated chains are cross-checked against `pipeline_relationships.generated.md` and `event_relationships.generated.md`, not invented independently.'
  );
  lines.push('');

  const routes = [...g.nodes.values()].filter((n) => n.type === 'HttpApi').sort((a, b) => a.label.localeCompare(b.label));
  for (const r of routes) {
    lines.push(`## \`${r.label}\``);
    lines.push('');
    const reachable = [...g.reachable(r.id, { types: ['CALLS'] })];
    lines.push(`**Graph-derived CALLS reachability (${reachable.length} node(s)):**`);
    lines.push('');
    if (reachable.length === 0) {
      lines.push('_(no CALLS edge resolved from this route)_');
    } else {
      for (const id of reachable.sort()) {
        const n = g.node(id);
        lines.push(`- \`${n ? n.label : id}\` _(${n?.type ?? '?'})_`);
      }
    }
    lines.push('');
    const narrative = NARRATIVE_CHAINS[r.label];
    if (narrative) {
      lines.push('**Curated end-to-end narrative:**');
      lines.push('');
      lines.push('```');
      lines.push(narrative.join('\n  ↓\n'));
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'execution_paths.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/execution_paths.generated.md');
}
