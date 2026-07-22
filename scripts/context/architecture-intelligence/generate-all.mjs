#!/usr/bin/env node
/**
 * scripts/context/architecture-intelligence/generate-all.mjs
 * Runs every Phase-2 (Architecture Knowledge Graph) generator. Kept
 * separate from the Phase-1 `scripts/context/generate-all.mjs` driver so
 * `pnpm context:generate` (Phase 1, unchanged) and
 * `pnpm context:graph` (Phase 2, additive) can be run/verified independently.
 * `pnpm context:generate:all` runs both.
 */
import { join } from 'node:path';
import { REPO_ROOT, writeGenerated } from '../lib/analyzer.mjs';
import { buildArchitectureGraph } from '../lib/graph.mjs';

import { generate as genGraph } from './generate-architecture-knowledge-graph.mjs';
import { generate as genIndex } from './generate-architecture-index.mjs';
import { generate as genExecutionPaths } from './generate-execution-paths.mjs';
import { generate as genInformationFlow } from './generate-information-flow.mjs';
import { generate as genDomainRel } from './generate-domain-relationships.mjs';
import { generate as genContextRel } from './generate-context-relationships.mjs';
import { generate as genKnowledgeRel } from './generate-knowledge-relationships.mjs';
import { generate as genIdentityRel } from './generate-identity-relationships.mjs';
import { generate as genPipelineRel } from './generate-pipeline-relationships.mjs';
import { generate as genRuntimeRel } from './generate-runtime-relationships.mjs';
import { generate as genDatabaseRel } from './generate-database-relationships.mjs';
import { generate as genEventRel } from './generate-event-relationships.mjs';
import { generate as genApiRel } from './generate-api-relationships.mjs';

const DIR = (...p) => join(REPO_ROOT, '.context', 'architecture-intelligence', ...p);

export function generateAll() {
  buildArchitectureGraph({ force: true }); // rebuild once; every generator below shares the cache
  const written = [];
  const write = (file, contents, isJson = false) => {
    writeGenerated(DIR(file), isJson ? JSON.stringify(contents, null, 2) : contents);
    written.push(file);
    console.log(`✅ .context/architecture-intelligence/${file}`);
  };

  write('architecture_knowledge_graph.generated.json', genGraph(), true);
  write('architecture_index.generated.md', genIndex());
  write('execution_paths.generated.md', genExecutionPaths());
  write('information_flow.generated.md', genInformationFlow());
  write('domain_relationships.generated.md', genDomainRel());
  write('context_relationships.generated.md', genContextRel());
  write('knowledge_relationships.generated.md', genKnowledgeRel());
  write('identity_relationships.generated.md', genIdentityRel());
  write('pipeline_relationships.generated.md', genPipelineRel());
  write('runtime_relationships.generated.md', genRuntimeRel());
  write('database_relationships.generated.md', genDatabaseRel());
  write('event_relationships.generated.md', genEventRel());
  write('api_relationships.generated.md', genApiRel());

  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = generateAll();
  console.log(`\nGenerated ${written.length} artifacts under .context/architecture-intelligence/.`);
}
