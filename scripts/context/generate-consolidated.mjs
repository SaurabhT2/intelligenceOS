#!/usr/bin/env node
/**
 * scripts/context/generate-consolidated.mjs
 *
 * `pnpm context:generate` — the ONE command, producing the ONLY three
 * files under `.context/`:
 *   - architecture.generated.md    (every narrative doc, one file, TOC'd)
 *   - architecture.generated.json  (every graph/JSON artifact, one file, sectioned)
 *   - context_refresh_summary.generated.md (small, high-signal manifest)
 *
 * This does not re-implement any extraction: every section below is the
 * exact output of the same `generate()` function the previous 18-file /
 * 13-file split called — this file only merges and de-duplicates the
 * *presentation* layer. Where a Phase-1 narrative doc and a Phase-2
 * relationship doc covered the same subject (domain/database/event/api/
 * runtime/knowledge/identity/context), the Phase-2 graph-derived ledger is
 * nested as a subsection of the Phase-1 narrative section instead of
 * repeated as its own top-level document.
 */
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated, buildRepoModel, GENERATED_HEADER_NOTE } from './lib/analyzer.mjs';
import { buildArchitectureGraph } from './lib/graph.mjs';
import { asSection, buildToc } from './lib/merge-docs.mjs';

import { generate as genMonorepoContext } from './generate-monorepo-context.mjs';
import { generate as genAgentEntrypoints } from './generate-agent-entrypoints.mjs';
import { generate as genRuntimeModel } from './generate-runtime-model.mjs';
import { generate as genCognitionPipeline } from './generate-cognition-pipeline.mjs';
import { generate as genLearningPipeline } from './generate-learning-pipeline.mjs';
import { generate as genKnowledgePipeline } from './generate-knowledge-pipeline.mjs';
import { generate as genIdentityPipeline } from './generate-identity-pipeline.mjs';
import { generate as genContextBuilder } from './generate-context-builder.mjs';
import { generate as genProfileModel } from './generate-profile-model.mjs';
import { generate as genDomainOwnership } from './generate-domain-ownership.mjs';
import { generate as genDatabaseContext } from './generate-database-context.mjs';
import { generate as genEventBus } from './generate-event-bus.mjs';
import { generate as genApiContract } from './generate-api-contract.mjs';
import { generate as genRepositoryHealth } from './generate-repository-health.mjs';
import { generateArchitectureGraph, generateDependencyImpact, generateTopicGraphs } from './generate-architecture-graph.mjs';
import { generate as genBehaviorContracts } from './generate-behavior-contracts.mjs';
import { generate as genContextRefreshSummary } from './generate-context-refresh-summary.mjs';

import { generate as genArchitectureIndex } from './architecture-intelligence/generate-architecture-index.mjs';
import { generate as genArchitectureKnowledgeGraph } from './architecture-intelligence/generate-architecture-knowledge-graph.mjs';
import { generate as genExecutionPaths } from './architecture-intelligence/generate-execution-paths.mjs';
import { generate as genInformationFlow } from './architecture-intelligence/generate-information-flow.mjs';
import { generate as genDomainRelationships } from './architecture-intelligence/generate-domain-relationships.mjs';
import { generate as genContextRelationships } from './architecture-intelligence/generate-context-relationships.mjs';
import { generate as genKnowledgeRelationships } from './architecture-intelligence/generate-knowledge-relationships.mjs';
import { generate as genIdentityRelationships } from './architecture-intelligence/generate-identity-relationships.mjs';
import { generate as genPipelineRelationships } from './architecture-intelligence/generate-pipeline-relationships.mjs';
import { generate as genRuntimeRelationships } from './architecture-intelligence/generate-runtime-relationships.mjs';
import { generate as genDatabaseRelationships } from './architecture-intelligence/generate-database-relationships.mjs';
import { generate as genEventRelationships } from './architecture-intelligence/generate-event-relationships.mjs';
import { generate as genApiRelationships } from './architecture-intelligence/generate-api-relationships.mjs';

const SUBSECTION_NOTE = '_Graph-derived relationship ledger (from the Architecture Knowledge Graph) — see `architecture.generated.json`._';

export function generateMarkdown(model) {
  const sections = [
    { title: 'Monorepo Context', body: genMonorepoContext(model) },
    { title: 'Agent Entrypoints', body: genAgentEntrypoints(model) },
    { title: 'Architecture Knowledge Graph — Overview', body: genArchitectureIndex() },
    { title: 'Cognition Pipeline', body: genCognitionPipeline(model) },
    { title: 'Learning Pipeline', body: genLearningPipeline(model) },
    {
      title: 'Knowledge Pipeline',
      body: genKnowledgePipeline(model) + '\n\n' + asSection(genKnowledgeRelationships(), { title: 'Knowledge subsystem — graph relationships', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    {
      title: 'Identity Pipeline',
      body: genIdentityPipeline(model) + '\n\n' + asSection(genIdentityRelationships(), { title: 'Identity subsystem — graph relationships', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    { title: 'Pipeline Stage Sequencing (graph-derived)', body: genPipelineRelationships() },
    {
      title: 'Context Builder',
      body: genContextBuilder(model) + '\n\n' + asSection(genContextRelationships(), { title: 'CognitionContext / IntelligenceProfile fields — graph relationships', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    { title: 'Profile Model', body: genProfileModel(model) },
    {
      title: 'Domain Ownership',
      body: genDomainOwnership(model) + '\n\n' + asSection(genDomainRelationships(), { title: 'Domains — graph relationships', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    {
      title: 'Database Context',
      body: genDatabaseContext(model) + '\n\n' + asSection(genDatabaseRelationships(), { title: 'Tables — graph relationships', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    {
      title: 'Event Bus',
      body: genEventBus(model) + '\n\n' + asSection(genEventRelationships(), { title: 'Events — graph relationships', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    {
      title: 'API Contract',
      body: genApiContract(model) + '\n\n' + asSection(genApiRelationships(), { title: 'Routes — graph relationships & reachability', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    {
      title: 'Runtime Model',
      body: genRuntimeModel(model) + '\n\n' + asSection(genRuntimeRelationships(), { title: 'Process entrypoints — graph reachability', sectionLevel: 3, note: SUBSECTION_NOTE }),
    },
    { title: 'Execution Paths', body: genExecutionPaths() },
    { title: 'Information Flow', body: genInformationFlow() },
    { title: 'Repository Health', body: genRepositoryHealth(model) },
  ];

  const lines = [];
  lines.push('# IntelligenceOS Architecture');
  lines.push('');
  lines.push(GENERATED_HEADER_NOTE);
  lines.push('');
  lines.push(
    'This is the single consolidated architecture document for IntelligenceOS — every ' +
    'narrative artifact this framework produces, merged into one file so an agent (or a ' +
    'human) reads one document instead of thirty. The single canonical machine-readable ' +
    'companion is `architecture.generated.json`. Both regenerate on every build ' +
    '(`pnpm build` runs `pnpm context:generate` first) and are reproducible: re-running ' +
    'with no source changes produces byte-identical output.'
  );
  lines.push('');
  lines.push('## Table of contents');
  lines.push('');
  lines.push(buildToc(sections));
  lines.push('');

  for (const s of sections) {
    lines.push(asSection(s.body, { title: s.title, sectionLevel: 2 }));
    lines.push('');
  }

  return lines.join('\n');
}

export function generateJson(model) {
  return {
    generator: 'scripts/context/generate-consolidated.mjs',
    description:
      'Single consolidated machine-readable artifact: every graph/JSON output this framework ' +
      'produces, sectioned by key. `knowledgeGraph` is the canonical Architecture Knowledge ' +
      'Graph (nodes/edges); the remaining sections are analyses computed alongside it that ' +
      'aren\'t (yet) folded into graph node/edge metadata — see the "Architecture Knowledge ' +
      'Graph — Overview" section of architecture.generated.md for why.',
    fileLevelGraph: generateArchitectureGraph(model),
    knowledgeGraph: genArchitectureKnowledgeGraph(),
    dependencyImpact: generateDependencyImpact(model),
    behaviorContracts: genBehaviorContracts(model),
    topicGraphs: generateTopicGraphs(model),
  };
}

export function generateAll() {
  const model = buildRepoModel({ force: true });
  buildArchitectureGraph({ force: true });

  const md = generateMarkdown(model);
  const json = generateJson(model);
  writeGenerated(join(REPO_ROOT, '.context', 'architecture.generated.md'), md);
  console.log('✅ .context/architecture.generated.md');
  writeGenerated(join(REPO_ROOT, '.context', 'architecture.generated.json'), JSON.stringify(json, null, 2));
  console.log('✅ .context/architecture.generated.json');

  // Refresh summary is written last so it can describe the two files above.
  const summary = genContextRefreshSummary(model);
  writeGenerated(join(REPO_ROOT, '.context', 'context_refresh_summary.generated.md'), summary);
  console.log('✅ .context/context_refresh_summary.generated.md');

  return ['architecture.generated.md', 'architecture.generated.json', 'context_refresh_summary.generated.md'];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = generateAll();
  console.log(`\nGenerated ${written.length} artifacts under .context/.`);
}
