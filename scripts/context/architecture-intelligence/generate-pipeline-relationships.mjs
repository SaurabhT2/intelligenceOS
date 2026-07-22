#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, GENERATED_HEADER_NOTE } from '../lib/analyzer.mjs';
import { buildArchitectureGraph, idClass, idMethod } from '../lib/graph.mjs';

const PIPELINES = {
  'Learning Pipeline': [
    ['SignalExtractor', 'packages/intelligence-os/src/pipeline/SignalExtractor.ts'],
    ['EvidenceExtractor', 'packages/intelligence-os/src/pipeline/EvidenceExtractor.ts'],
    ['ObservationBuilder', 'packages/intelligence-os/src/pipeline/ObservationBuilder.ts'],
    ['HypothesisEngine', 'packages/intelligence-os/src/pipeline/HypothesisEngine.ts'],
    ['LearningValidator', 'packages/intelligence-os/src/pipeline/LearningValidator.ts'],
    ['FeedbackProcessor', 'packages/intelligence-os/src/pipeline/FeedbackProcessor.ts'],
    ['ProfileBuilder', 'packages/intelligence-os/src/pipeline/ProfileBuilder.ts'],
  ],
  'Knowledge Pipeline': [
    ['KnowledgeProcessor', 'packages/intelligence-os/src/knowledge/KnowledgeProcessor.ts'],
    ['KnowledgeValidator', 'packages/intelligence-os/src/knowledge/KnowledgeValidator.ts'],
    ['KnowledgeIntelligenceDomain', 'packages/intelligence-os/src/domains/KnowledgeIntelligenceDomain.ts'],
    ['ProfileBuilder', 'packages/intelligence-os/src/pipeline/ProfileBuilder.ts'],
    ['ContextBuilder', 'packages/intelligence-os/src/context/ContextBuilder.ts'],
  ],
  'Evidence Bridge (ADR-005, Knowledge → Learning Pipeline)': [
    ['KnowledgeAssetEvidenceAdapter', 'packages/intelligence-os/src/knowledge/KnowledgeAssetEvidenceAdapter.ts'],
    ['EvidenceExtractor', 'packages/intelligence-os/src/pipeline/EvidenceExtractor.ts'],
    ['ObservationBuilder', 'packages/intelligence-os/src/pipeline/ObservationBuilder.ts'],
    ['HypothesisEngine', 'packages/intelligence-os/src/pipeline/HypothesisEngine.ts'],
    ['LearningValidator', 'packages/intelligence-os/src/pipeline/LearningValidator.ts'],
  ],
  'Identity Pipeline': [
    ['ProfileBuilder', 'packages/intelligence-os/src/pipeline/ProfileBuilder.ts'],
    ['ContextBuilder', 'packages/intelligence-os/src/context/ContextBuilder.ts'],
  ],
  'Cognition (request) Pipeline': [
    ['CognitionProviderImpl', 'packages/intelligence-os/src/api/CognitionProviderImpl.ts'],
    ['ContextBuilder', 'packages/intelligence-os/src/context/ContextBuilder.ts'],
  ],
};

export function generate() {
  const g = buildArchitectureGraph();
  const lines = [];
  lines.push('# Pipeline Relationships');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'Each pipeline below is a hand-declared *stage ordering* (the sequence is architectural intent, ' +
    'not discoverable purely from CALLS edges — the stages are decoupled via the event bus, not direct ' +
    'method calls), cross-checked against the graph for what real CALLS/EMITS/CONSUMES/DEPENDS_ON edges ' +
    'exist between consecutive stages. Where no direct edge exists between two adjacent stages, that\'s ' +
    'called out explicitly rather than silently implied — it usually means the handoff is event-bus- ' +
    'mediated (see `.context/architecture-intelligence/event_relationships.generated.md`).'
  );
  lines.push('');

  for (const [pipelineName, stages] of Object.entries(PIPELINES)) {
    lines.push(`## ${pipelineName}`);
    lines.push('');
    for (let i = 0; i < stages.length; i++) {
      const [name, file] = stages[i];
      const classId = idClass(file, name);
      const node = g.node(classId);
      lines.push(`### ${i + 1}. \`${name}\``);
      lines.push('');
      if (!node) {
        lines.push('_(class not found in graph)_');
        lines.push('');
        continue;
      }
      const emits = [...new Set(g.edgesFrom(classId, 'EMITS').map((e) => g.node(e.to)?.label ?? e.to))];
      const consumes = [...new Set(g.edgesFrom(classId, 'CONSUMES').map((e) => g.node(e.to)?.label ?? e.to))];
      const owns = [...new Set(g.edgesFrom(classId, 'OWNS').map((e) => g.node(e.to)?.label ?? e.to))];
      if (emits.length) lines.push(`- **Emits:** ${emits.map((e) => `\`${e}\``).join(', ')}`);
      if (consumes.length) lines.push(`- **Consumes:** ${consumes.map((e) => `\`${e}\``).join(', ')}`);
      if (owns.length) lines.push(`- **Owns:** ${owns.map((e) => `\`${e}\``).join(', ')}`);

      if (i < stages.length - 1) {
        const [nextName, nextFile] = stages[i + 1];
        const nextClassId = idClass(nextFile, nextName);
        const direct = g.edgesFrom(classId).filter((e) => e.to === nextClassId || g.node(e.to)?.file === nextFile);
        const path = g.bfsPath(classId, nextClassId, { types: ['CALLS', 'DEPENDS_ON', 'EMITS', 'CONSUMES'], maxDepth: 6 });
        if (direct.length || (path && path.length <= 3)) {
          lines.push(`- **→ Next stage (\`${nextName}\`):** direct graph edge found.`);
        } else if (path) {
          lines.push(`- **→ Next stage (\`${nextName}\`):** connected via ${path.length - 1} hop(s): ${path.map((id) => `\`${g.node(id)?.label ?? id}\``).join(' → ')}`);
        } else {
          lines.push(`- **→ Next stage (\`${nextName}\`):** no direct graph edge — handoff is event-bus-mediated or orchestrated by a caller neither class imports directly (e.g. \`IntelligenceOS\`).`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(join(REPO_ROOT, '.context', 'architecture-intelligence', 'pipeline_relationships.generated.md'), generate());
  console.log('✅ .context/architecture-intelligence/pipeline_relationships.generated.md');
}
