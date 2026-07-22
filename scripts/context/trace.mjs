#!/usr/bin/env node
/**
 * scripts/context/trace.mjs
 * The Trace Engine: `pnpm trace <topic>`.
 *
 * For the topics the mission names explicitly (knowledge, identity,
 * workspace) prints the curated end-to-end chain (same data backing
 * `.context/architecture-intelligence/execution_paths.generated.md` and
 * `pipeline_relationships.generated.md`). For anything else, treats the
 * argument as a class name and does a live forward BFS over the
 * Architecture Knowledge Graph's CALLS/EMITS/CONSUMES/DEPENDS_ON edges,
 * printing every node reached, layer by layer — a genuine graph query,
 * not a lookup table entry.
 */
import { buildArchitectureGraph, idClass } from './lib/graph.mjs';
import { buildRepoModel } from './lib/analyzer.mjs';

const TOPIC_CHAINS = {
  knowledge: [
    'Knowledge Upload  (POST /v1/knowledge/ingest → IntelligenceOS.ingestKnowledgeAsset)',
    'Knowledge Processor  (KnowledgeProcessor.process, extracts + emits intelligence.signal.extracted)',
    'Extraction  (VocabularyExtractor / FrameworkExtractor / PatternExtractor / VisualFeatureExtractor)',
    'Validation  (KnowledgeValidator)',
    'Knowledge Domain  (KnowledgeIntelligenceDomain — owns intelligence.knowledge_assets)',
    '── branches in parallel from the same event ──',
    '(5a) Descriptive: Profile Builder  (ProfileBuilder.rebuildForSubject — folds knowledge into Profile.knowledgeSummary directly)',
    '(5b) Evidentiary, ADR-005: KnowledgeAssetEvidenceAdapter → EvidenceExtractor → Observation → Hypothesis → Learning (same gate as any other evidence — see "learning" trace)',
    'Context Builder  (ContextBuilder.build → CognitionContext.knowledge, and — if 5b promoted — .identity/.voice too)',
    'Prompt  (external artifact-generation consumer — outside this repo)',
  ],
  identity: [
    'Signal / Evidence  (SignalExtractor for feedback, or EvidenceExtractor for knowledge — ADR-005 — both produce the same Signal shape)',
    'Observation  (ObservationBuilder)',
    'Hypothesis  (HypothesisEngine → intelligence.hypotheses, evidence_trail since migration 007)',
    'Learning  (LearningValidator → intelligence.learning.validated, evidence_trail copied to source_summary.evidenceTrail)',
    'Profile  (ProfileBuilder.rebuildForSubject → intelligence.profile.updated)',
    'Identity  (identitySynthesis.deriveIdentityContribution + voiceMapping.deriveVoiceProfile/deriveConfidence — unaware of which source produced the Learning)',
    'Context Builder  (ContextBuilder.build → CognitionContext.identity/voice/confidence)',
  ],
  workspace: [
    'Persona  (workspace admin declares voice/identity intent)',
    'Workspace Configuration  (POST /v1/workspace-configuration → IntelligenceOS.ingestWorkspaceConfiguration)',
    'Workspace Domain  (persisted as Knowledge — WorkspaceIntelligenceDomain / KnowledgeIntelligenceDomain)',
    'Context Builder  (ContextBuilder.build reads workspaceContext.voiceConfiguration/identityConfiguration)',
    'Identity  (applyVoiceConfiguration / applyIdentityConfiguration override the Learning-derived baseline — ADR-003 §2.4 precedence)',
    'Prompt  (external artifact-generation consumer)',
  ],
  learning: [
    'Signal Extraction  (SignalExtractor — feedback/observations)  |  Evidence Extraction  (EvidenceExtractor — knowledge, ADR-005)',
    'Observation  (ObservationBuilder)',
    'Hypothesis  (HypothesisEngine)',
    'Learning  (LearningValidator → intelligence.learning.validated)',
    'Validation / Review  (FeedbackProcessor, supervisory review → intelligence.learning.reviewed)',
    'Profile  (ProfileBuilder.rebuildForSubject → intelligence.profile.updated)',
    'Context  (ContextBuilder.build)',
  ],
  evidence: [
    'Evidence Source  (today: an uploaded Knowledge asset — knowledge/KnowledgeAssetEvidenceAdapter.buildKnowledgeAssetEvidenceInput; future: connector/web-import/repository/conversation, one new adapter file each)',
    'Evidence Extractor  (pipeline/EvidenceExtractor.extract — source-agnostic quality gate: confidence + supporting-item thresholds; ADR-005)',
    'Signal  (same shape SignalExtractor produces — Stage 2+ has zero awareness of which Stage-1 producer supplied it)',
    'Observation  (ObservationBuilder.build)',
    'Hypothesis  (HypothesisEngine.process — corroborates with Signals from ANY source in the same taxonomy category, including feedback-derived ones)',
    'Learning  (LearningValidator.evaluate — same promotion threshold as any other evidence; evidence_trail, migration 007, records every contributing document)',
    'Profile → Identity  (ProfileBuilder.rebuildForSubject → identitySynthesis — no special-casing of evidence-bridge-derived Learnings)',
  ],
  cognition: [
    'HTTP request  (POST /v1/cognition/resolve)',
    'CognitionProviderImpl.resolveCognitionContext()',
    'ContextBuilder.build()',
    'UserIntelligenceDomain.getCurrentProfileForSubject()',
    'voiceMapping.ts / identitySynthesis.ts',
    'CognitionContext  (returned to caller)',
  ],
};

function printChain(topic, chain) {
  console.log(`\nTrace: ${topic}\n`);
  console.log(chain.join('\n  ↓\n'));
  console.log('');
}

function findClassNode(g, name) {
  return [...g.nodes.values()].find((n) => (n.type === 'Class' || n.type === 'Domain') && n.label === name);
}

function traceGraphForward(g, startNode) {
  console.log(`\nTrace: ${startNode.label} (live graph query, forward CALLS/EMITS/CONSUMES/DEPENDS_ON)\n`);
  const types = ['CALLS', 'EMITS', 'CONSUMES', 'DEPENDS_ON', 'OWNS', 'WRITES', 'READS', 'BUILDS', 'CONTRIBUTES_TO'];
  let frontier = [startNode.id];
  const visited = new Set(frontier);
  let depth = 0;
  while (frontier.length && depth < 6) {
    console.log(`Layer ${depth}: ${frontier.map((id) => g.node(id)?.label ?? id).join(', ')}`);
    const next = [];
    for (const id of frontier) {
      for (const e of g.edgesFrom(id)) {
        if (!types.includes(e.type)) continue;
        if (!visited.has(e.to)) { visited.add(e.to); next.push(e.to); }
      }
    }
    frontier = next;
    depth++;
  }
  console.log('');
}

function main() {
  const topic = process.argv[2];
  if (!topic) {
    console.log('Usage: pnpm trace <topic>');
    console.log(`Known topics: ${Object.keys(TOPIC_CHAINS).join(', ')}`);
    console.log('Any other argument is treated as a class name and traced live against the Architecture Knowledge Graph.');
    process.exit(1);
  }

  if (TOPIC_CHAINS[topic.toLowerCase()]) {
    printChain(topic, TOPIC_CHAINS[topic.toLowerCase()]);
    return;
  }

  const g = buildArchitectureGraph();
  const node = findClassNode(g, topic);
  if (!node) {
    console.log(`Unknown topic "${topic}".`);
    console.log(`Known topics: ${Object.keys(TOPIC_CHAINS).join(', ')}`);
    console.log('Or pass an exact class name present in the repository (e.g. "ProfileBuilder", "ContextBuilder").');
    process.exit(1);
  }
  traceGraphForward(g, node);
}

main();
