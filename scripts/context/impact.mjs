#!/usr/bin/env node
/**
 * scripts/context/impact.mjs
 * Graph-driven impact analysis: `pnpm impact <ClassName>`.
 *
 * Reports, for a given class, everything the Architecture Knowledge Graph
 * shows as downstream of it: affected pipelines (does any curated pipeline
 * stage list reference this class), affected APIs (is it reachable from
 * any HttpApi route via CALLS), affected context fields (BUILDS/
 * CONTRIBUTES_TO reachability into ContextField/ProfileField nodes),
 * affected domains/tables (OWNS/READS/WRITES reachability), and the
 * module-level blast radius already computed for dependency_impact.generated.json.
 */
import { buildArchitectureGraph } from './lib/graph.mjs';
import { buildRepoModel } from './lib/analyzer.mjs';

const PIPELINE_MEMBERSHIP = {
  ObservationBuilder: ['Learning Pipeline', 'Evidence Bridge (ADR-005)'],
  SignalExtractor: ['Learning Pipeline'],
  EvidenceExtractor: ['Learning Pipeline', 'Evidence Bridge (ADR-005)', 'Knowledge Pipeline'],
  KnowledgeAssetEvidenceAdapter: ['Evidence Bridge (ADR-005)', 'Knowledge Pipeline'],
  HypothesisEngine: ['Learning Pipeline', 'Evidence Bridge (ADR-005)'],
  LearningValidator: ['Learning Pipeline', 'Evidence Bridge (ADR-005)'],
  FeedbackProcessor: ['Learning Pipeline', 'Evidence Bridge (ADR-005)'],
  ProfileBuilder: ['Learning Pipeline', 'Knowledge Pipeline', 'Identity Pipeline'],
  KnowledgeProcessor: ['Knowledge Pipeline'],
  KnowledgeValidator: ['Knowledge Pipeline'],
  KnowledgeIntelligenceDomain: ['Knowledge Pipeline'],
  ContextBuilder: ['Knowledge Pipeline', 'Identity Pipeline', 'Cognition (request) Pipeline'],
  CognitionProviderImpl: ['Cognition (request) Pipeline'],
};

function findClassNode(g, name) {
  return [...g.nodes.values()].find((n) => (n.type === 'Class' || n.type === 'Domain') && n.label === name);
}

function main() {
  const name = process.argv[2];
  if (!name) {
    console.log('Usage: pnpm impact <ClassName>');
    console.log('Example: pnpm impact ProfileBuilder');
    process.exit(1);
  }

  const g = buildArchitectureGraph();
  const node = findClassNode(g, name);
  if (!node) {
    console.log(`Class "${name}" not found in the Architecture Knowledge Graph.`);
    console.log('Names are case-sensitive and must match a real class in packages/intelligence-os/src.');
    process.exit(1);
  }

  console.log(`\nImpact analysis: ${name}  (${node.file})\n`);

  const pipelines = PIPELINE_MEMBERSHIP[name] ?? [];
  console.log(`Affected pipelines: ${pipelines.length ? pipelines.join(', ') : '(none of the curated pipeline stage lists reference this class — see scripts/context/impact.mjs PIPELINE_MEMBERSHIP if it should)'}`);

  const routes = [...g.nodes.values()].filter((n) => n.type === 'HttpApi');
  const affectedRoutes = routes.filter((r) => {
    const reachable = g.reachable(r.id, { types: ['CALLS'] });
    return [...reachable].some((id) => id === node.id || g.node(id)?.file === node.file);
  });
  console.log(`Affected APIs: ${affectedRoutes.length ? affectedRoutes.map((r) => r.label).join(', ') : '(none reach this class via a resolved CALLS edge)'}`);

  const methodIds = g.edgesTo(node.id, 'USES')
    .map((e) => e.from)
    .filter((id) => id.startsWith('method:'));
  const seeds = [node.id, ...methodIds];

  const reachableFrom = (types) => {
    const acc = new Set();
    for (const seed of seeds) for (const id of g.reachable(seed, { types })) acc.add(id);
    return acc;
  };

  const fieldTypes = ['BUILDS', 'CONTRIBUTES_TO', 'SYNTHESIZES'];
  const reachableFields = [...reachableFrom(fieldTypes)]
    .map((id) => g.node(id))
    .filter((n) => n && (n.type === 'ContextField' || n.type === 'ProfileField'));
  console.log(`Affected context/profile fields: ${reachableFields.length ? reachableFields.map((n) => n.label).join(', ') : '(none found via BUILDS/CONTRIBUTES_TO/SYNTHESIZES)'}`);

  const tableTypes = ['OWNS', 'READS', 'WRITES', 'PERSISTS'];
  const reachableTables = [...reachableFrom(tableTypes)]
    .map((id) => g.node(id))
    .filter((n) => n && n.type === 'Table');
  console.log(`Affected tables: ${reachableTables.length ? reachableTables.map((n) => n.label).join(', ') : '(none — this class does not directly own/read/write a table)'}`);

  const model = buildRepoModel();
  const file = model.files.find((f) => f.relPath === node.file);
  if (file) {
    const importers = g.edgesTo(`module:${node.file}`, 'DEPENDS_ON').map((e) => e.from.replace(/^module:/, ''));
    console.log(`Direct in-repo importers of ${node.file}: ${importers.length ? importers.join(', ') : '(none)'}`);
  }

  const entrypoints = ['apps/api/src/server.ts', 'apps/api/api/cognition.ts', 'apps/demo/src/index.ts', 'apps/playground/src/index.ts'];
  const affectedRuntimes = entrypoints.filter((e) => {
    const reachable = g.reachable(`module:${e}`, { types: ['DEPENDS_ON'] });
    return [...reachable].includes(`module:${node.file}`);
  });
  console.log(`Affected runtime entrypoints (via relative-import reachability): ${affectedRuntimes.length ? affectedRuntimes.join(', ') : '(none directly — likely reached only through the published @intelligence-os/core package surface, which this graph does not trace across package boundaries)'}`);

  console.log('');
}

main();
