#!/usr/bin/env node
/**
 * scripts/context/generate-all.mjs
 * The single entrypoint: `pnpm context:generate`.
 *
 * Runs every generator against ONE shared repo model (built once, here),
 * in a fixed order, then writes context_refresh_summary.generated.md last
 * so it can report on everything that ran before it. Reproducibility
 * contract: re-running this with no source changes produces byte-identical
 * output, because the model is built from sorted file lists with no
 * timestamps or environment-dependent data feeding into any artifact
 * (the refresh summary uses a content fingerprint, not a wall-clock time —
 * see generate-context-refresh-summary.mjs).
 */
import { join } from 'node:path';
import { buildRepoModel, REPO_ROOT, writeGenerated } from './lib/analyzer.mjs';

import { generate as genMonorepoContext } from './generate-monorepo-context.mjs';
import { generateArchitectureGraph, generateDependencyImpact, generateTopicGraphs } from './generate-architecture-graph.mjs';
import { generate as genDatabaseContext } from './generate-database-context.mjs';
import { generate as genBehaviorContracts } from './generate-behavior-contracts.mjs';
import { generate as genRuntimeModel } from './generate-runtime-model.mjs';
import { generate as genAgentEntrypoints } from './generate-agent-entrypoints.mjs';
import { generate as genCognitionPipeline } from './generate-cognition-pipeline.mjs';
import { generate as genLearningPipeline } from './generate-learning-pipeline.mjs';
import { generate as genKnowledgePipeline } from './generate-knowledge-pipeline.mjs';
import { generate as genIdentityPipeline } from './generate-identity-pipeline.mjs';
import { generate as genContextBuilder } from './generate-context-builder.mjs';
import { generate as genDomainOwnership } from './generate-domain-ownership.mjs';
import { generate as genEventBus } from './generate-event-bus.mjs';
import { generate as genApiContract } from './generate-api-contract.mjs';
import { generate as genProfileModel } from './generate-profile-model.mjs';
import { generate as genRepositoryHealth } from './generate-repository-health.mjs';
import { generate as genRefreshSummary } from './generate-context-refresh-summary.mjs';

const CTX = (...p) => join(REPO_ROOT, '.context', ...p);

export function generateAll() {
  const model = buildRepoModel({ force: true });
  const written = [];

  const write = (relPath, contents, isJson = false) => {
    const full = CTX(relPath);
    writeGenerated(full, isJson ? JSON.stringify(contents, null, 2) : contents);
    written.push(relPath);
    console.log(`✅ .context/${relPath}`);
  };

  write('monorepo_context.generated.md', genMonorepoContext(model));
  write('architecture_graph.generated.json', generateArchitectureGraph(model), true);
  write('dependency_impact.generated.json', generateDependencyImpact(model), true);
  const topics = generateTopicGraphs(model);
  for (const [name, graph] of Object.entries(topics)) write(join('graphs', `${name}.generated.json`), graph, true);
  write('database_context.generated.md', genDatabaseContext(model));
  write('behavior_contracts.generated.json', genBehaviorContracts(model), true);
  write('runtime_model.generated.md', genRuntimeModel(model));
  write('agent_entrypoints.generated.md', genAgentEntrypoints(model));
  write('cognition_pipeline.generated.md', genCognitionPipeline(model));
  write('learning_pipeline.generated.md', genLearningPipeline(model));
  write('knowledge_pipeline.generated.md', genKnowledgePipeline(model));
  write('identity_pipeline.generated.md', genIdentityPipeline(model));
  write('context_builder.generated.md', genContextBuilder(model));
  write('domain_ownership.generated.md', genDomainOwnership(model));
  write('event_bus.generated.md', genEventBus(model));
  write('api_contract.generated.md', genApiContract(model));
  write('profile_model.generated.md', genProfileModel(model));
  write('repository_health.generated.md', genRepositoryHealth(model));

  // Refresh summary is generated last so it can describe everything above.
  write('context_refresh_summary.generated.md', genRefreshSummary(model, written));

  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = generateAll();
  console.log(`\nGenerated ${written.length + 1} artifacts under .context/.`);
}
