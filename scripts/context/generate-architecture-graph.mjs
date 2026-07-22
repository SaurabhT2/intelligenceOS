#!/usr/bin/env node
/**
 * generate-architecture-graph.mjs
 * Produces:
 *  - .context/architecture_graph.generated.json  (file-level dependency graph,
 *    the master graph every other graph is a filtered view of)
 *  - .context/dependency_impact.generated.json    (reverse-dependency /
 *    blast-radius index: for every file, everything that transitively
 *    depends on it)
 *  - .context/graphs/*.generated.json             (topic-scoped subgraphs:
 *    learning, knowledge, identity, context, api, event, domain, pipeline)
 */
import { join } from 'node:path';
import {
  buildRepoModel, REPO_ROOT, writeGenerated, buildImportGraph,
} from './lib/analyzer.mjs';
import { writeFileSync } from 'node:fs';

function writeJson(absPath, obj) {
  writeGenerated(absPath, JSON.stringify(obj, null, 2));
}

function transitiveClosure(startSet, edgeMap, maxDepth = 50) {
  const visited = new Set(startSet);
  let frontier = [...startSet];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next = [];
    for (const node of frontier) {
      for (const dep of edgeMap.get(node) ?? []) {
        if (!visited.has(dep)) {
          visited.add(dep);
          next.push(dep);
        }
      }
    }
    frontier = next;
    depth++;
  }
  return visited;
}

export function generateArchitectureGraph(model) {
  const { edges } = buildImportGraph(model);
  const nodes = model.files.map((f) => ({
    id: f.relPath,
    package: model.packages.find((p) => f.relPath.startsWith(p.relDir + '/'))?.name ?? null,
    classes: f.classes.map((c) => c.name),
    interfaces: f.interfaces.map((i) => i.name),
  }));
  const links = [];
  for (const [from, targets] of edges) {
    for (const to of [...targets].sort()) links.push({ from, to });
  }
  return {
    generator: 'scripts/context/generate-architecture-graph.mjs',
    description: 'File-level import graph across every parsed package. Only intra-repo relative imports are resolved as edges.',
    nodeCount: nodes.length,
    linkCount: links.length,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    links,
  };
}

export function generateDependencyImpact(model) {
  const { edges, importedBy } = buildImportGraph(model);
  const impact = {};
  for (const f of model.files) {
    const directDependents = [...(importedBy.get(f.relPath) ?? [])].sort();
    const transitiveDependents = [...transitiveClosure(directDependents, importedBy)].filter((x) => x !== f.relPath).sort();
    impact[f.relPath] = {
      directDependents,
      transitiveDependentCount: transitiveDependents.length,
      transitiveDependents,
    };
  }
  return {
    generator: 'scripts/context/generate-architecture-graph.mjs',
    description:
      'For every file, the set of files that would need review if this file\'s exported ' +
      'behavior changed — direct importers plus everything that transitively imports one of them.',
    files: impact,
  };
}

function subgraph(model, edges, predicate) {
  const nodeIds = model.files.filter((f) => predicate(f)).map((f) => f.relPath);
  const nodeSet = new Set(nodeIds);
  const links = [];
  for (const id of nodeIds) {
    for (const to of edges.get(id) ?? []) {
      if (nodeSet.has(to)) links.push({ from: id, to });
    }
  }
  return { nodes: nodeIds.sort(), links };
}

export function generateTopicGraphs(model) {
  const { edges } = buildImportGraph(model);
  const under = (prefix) => (f) => f.relPath.startsWith(prefix);
  return {
    learning_graph: subgraph(model, edges, under('packages/intelligence-os/src/pipeline/')),
    knowledge_graph: subgraph(model, edges, under('packages/intelligence-os/src/knowledge/')),
    identity_graph: subgraph(model, edges, (f) =>
      ['context/ContextBuilder.ts', 'context/identitySynthesis.ts', 'context/voiceMapping.ts', 'context/confidenceMerge.ts']
        .some((s) => f.relPath.endsWith(s))),
    context_graph: subgraph(model, edges, under('packages/intelligence-os/src/context/')),
    api_graph: subgraph(model, edges, (f) => f.relPath.includes('/api/')),
    event_graph: subgraph(model, edges, under('packages/intelligence-os/src/events/')),
    domain_graph: subgraph(model, edges, under('packages/intelligence-os/src/domains/')),
    pipeline_graph: subgraph(model, edges, (f) =>
      ['pipeline/', 'knowledge/', 'blueprint/'].some((p) => f.relPath.includes(`/src/${p}`))),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = buildRepoModel();
  writeJson(join(REPO_ROOT, '.context', 'architecture_graph.generated.json'), generateArchitectureGraph(model));
  console.log('✅ .context/architecture_graph.generated.json');
  writeJson(join(REPO_ROOT, '.context', 'dependency_impact.generated.json'), generateDependencyImpact(model));
  console.log('✅ .context/dependency_impact.generated.json');
  const topics = generateTopicGraphs(model);
  for (const [name, graph] of Object.entries(topics)) {
    writeJson(join(REPO_ROOT, '.context', 'graphs', `${name}.generated.json`), graph);
    console.log(`✅ .context/graphs/${name}.generated.json`);
  }
}
