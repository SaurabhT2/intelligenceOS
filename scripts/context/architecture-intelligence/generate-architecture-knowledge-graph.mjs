#!/usr/bin/env node
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';

export function generate() {
  const g = buildArchitectureGraph();
  return {
    generator: 'scripts/context/generate-architecture-knowledge-graph.mjs',
    description:
      'Canonical Architecture Knowledge Graph: every node (Repository, Package, Module, Class, ' +
      'Method, Interface, Domain, Table, Event, HttpApi, ContextField, ProfileField, Function) and ' +
      'every edge (OWNS, READS, WRITES, PERSISTS, CALLS, IMPLEMENTS, EMITS, CONSUMES, DEPENDS_ON, ' +
      'BUILDS, CONTRIBUTES_TO, SYNTHESIZES, USES). This is the single source of truth every other ' +
      'artifact under .context/architecture-intelligence/ is a projection of.',
    ...g.toJSON(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated(
    join(REPO_ROOT, '.context', 'architecture-intelligence', 'architecture_knowledge_graph.generated.json'),
    JSON.stringify(generate(), null, 2)
  );
  console.log('✅ .context/architecture-intelligence/architecture_knowledge_graph.generated.json');
}
