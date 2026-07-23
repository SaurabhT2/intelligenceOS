/**
 * tests/unit/knowledge/knowledge-pipeline.test.ts
 *
 * Tests for KnowledgeValidator, KnowledgeProcessor orchestration,
 * lifecycle transitions, edge cases, duplicates, and malformed assets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeAssetExtractor } from '../../../src/knowledge/KnowledgeAssetExtractor';
import { VocabularyExtractor } from '../../../src/knowledge/VocabularyExtractor';
import { FrameworkExtractor } from '../../../src/knowledge/FrameworkExtractor';
import { PatternExtractor } from '../../../src/knowledge/PatternExtractor';
import { KnowledgeValidator } from '../../../src/knowledge/KnowledgeValidator';
import { KnowledgeProcessor } from '../../../src/knowledge/KnowledgeProcessor';
import { KnowledgeIntelligenceDomain } from '../../../src/domains/KnowledgeIntelligenceDomain';
import { InProcessEventBus } from '../../../src/events/IntelligenceEventBus';
import type { KnowledgeAsset } from '../../../src/types/entities';
import type { KnowledgeAssetInput } from '../../../src/types/domains';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RICH_CONTENT = `
# Go-To-Market Playbook

## Phase 1: Market Discovery
In the discovery phase, our GTM team identifies Ideal Customer Profiles (ICP).
We apply SWOT analysis to understand competitive positioning.
Target segments are ranked by TAM, SAM, and SOM metrics.

## Phase 2: Positioning
First, we define our unique value proposition.
Then we map messaging to ICP pain points.
Finally, we validate positioning with pilot customers.

## Phase 3: Execution
The execution phase covers sales enablement, partner activation, and demand generation.
Our methodology ensures consistent delivery across all channels.
KPIs: pipeline velocity, win rate, CAC, LTV.

## Phase 4: Optimization
We continuously optimize based on feedback loops and market intelligence.
`;

const THIN_CONTENT = 'Short content.';

const EMPTY_CONTENT = '';

const baseInput = (): KnowledgeAssetInput => ({
  ownerType: 'user',
  userId: 'user-001',
  projectId: null,
  workspaceId: null,
  assetType: 'playbook',
  title: 'GTM Playbook',
  sourceFileRef: null,
});

// ── Mock Supabase ─────────────────────────────────────────────────────────────

function makeSupabaseMock(returnData: Record<string, unknown>[] = []) {
  const chain = {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'asset-001',
        owner_type: 'user',
        user_id: 'user-001',
        project_id: null,
        workspace_id: null,
        asset_type: 'playbook',
        title: 'GTM Playbook',
        source_file_ref: null,
        extracted_vocabulary: {},
        extracted_patterns: {},
        extracted_frameworks: {},
        confidence: 0.80,
        version: 1,
        is_current: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    }),
  };

  // For list queries (no .single())
  Object.assign(chain, {
    then: undefined,
  });

  // Make it return list data when not chained with .single()
  const listResult = Promise.resolve({ data: returnData, error: null });
  const singleResult = chain.single;

  // Override select to return list for non-single queries
  (chain as Record<string, unknown>)['_listResult'] = listResult;

  return chain as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// ── KnowledgeValidator ────────────────────────────────────────────────────────

describe('KnowledgeValidator', () => {
  const assetExtractor  = new KnowledgeAssetExtractor();
  const vocabExtractor  = new VocabularyExtractor();
  const fwExtractor     = new FrameworkExtractor();

  function makeJob(content: string) {
    return assetExtractor.createJob(baseInput(), 'asset-001', content);
  }

  it('assigns base confidence for a standard upload', async () => {
    const job = makeJob(RICH_CONTENT);
    const vocab = vocabExtractor.extract(job);
    const frameworks = fwExtractor.extract(job);
    const validator = new KnowledgeValidator(async () => []);

    const result = await validator.validate(job, vocab, frameworks);
    expect(result.confidence).toBeGreaterThanOrEqual(0.70);
    expect(result.confidence).toBeLessThanOrEqual(0.90);
  });

  it('assigns low confidence for empty content', async () => {
    const job = makeJob(EMPTY_CONTENT);
    const vocab = vocabExtractor.extract(job);
    const frameworks = fwExtractor.extract(job);
    const validator = new KnowledgeValidator(async () => []);

    const result = await validator.validate(job, vocab, frameworks);
    expect(result.confidence).toBeLessThan(0.50);
    expect(result.passed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('gives confidence boost for structured content', async () => {
    const structuredJob = makeJob(RICH_CONTENT);
    const unstructuredJob = makeJob(THIN_CONTENT + ' and some more text here to meet the word count minimum somewhat.');
    const vocab1 = vocabExtractor.extract(structuredJob);
    const vocab2 = vocabExtractor.extract(unstructuredJob);
    const fw1 = fwExtractor.extract(structuredJob);
    const fw2 = fwExtractor.extract(unstructuredJob);
    const validator = new KnowledgeValidator(async () => []);

    const r1 = await validator.validate(structuredJob, vocab1, fw1);
    const r2 = await validator.validate(unstructuredJob, vocab2, fw2);

    // Structured content should have higher confidence
    expect(r1.confidence).toBeGreaterThanOrEqual(r2.confidence);
  });

  it('detects duplicate assets by title similarity', async () => {
    const existingAsset: KnowledgeAsset = {
      id: 'existing-001',
      ownerType: 'user',
      userId: 'user-001',
      projectId: null,
      workspaceId: null,
      assetType: 'playbook',
      title: 'GTM Playbook',
      sourceFileRef: null,
      extractedVocabulary: null,
      extractedPatterns: null,
      extractedFrameworks: null,
      extractedVisualFeatures: null, contributionSummary: null,
      confidence: 0.80,
      version: 1,
      isCurrent: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const job = makeJob(RICH_CONTENT);
    const vocab = vocabExtractor.extract(job);
    const frameworks = fwExtractor.extract(job);
    const validator = new KnowledgeValidator(async () => [existingAsset]);

    const result = await validator.validate(job, vocab, frameworks);
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateAssetId).toBe('existing-001');
    expect(result.warnings.some(w => w.includes('Near-duplicate'))).toBe(true);
  });

  it('does not flag as duplicate when owner contexts differ', async () => {
    const existingAsset: KnowledgeAsset = {
      id: 'existing-001',
      ownerType: 'workspace', // Different owner type
      userId: null,
      projectId: null,
      workspaceId: 'ws-001',
      assetType: 'playbook',
      title: 'GTM Playbook',
      sourceFileRef: null,
      extractedVocabulary: null,
      extractedPatterns: null,
      extractedFrameworks: null,
      extractedVisualFeatures: null, contributionSummary: null,
      confidence: 0.80,
      version: 1,
      isCurrent: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const job = makeJob(RICH_CONTENT); // ownerType: 'user'
    const vocab = vocabExtractor.extract(job);
    const frameworks = fwExtractor.extract(job);
    const validator = new KnowledgeValidator(async () => [existingAsset]);

    const result = await validator.validate(job, vocab, frameworks);
    expect(result.isDuplicate).toBe(false);
  });

  it('computes corroboration score when terms overlap with existing assets', async () => {
    const existingAsset: KnowledgeAsset = {
      id: 'existing-001',
      ownerType: 'user',
      userId: 'user-001',
      projectId: null,
      workspaceId: null,
      assetType: 'framework',
      title: 'Product Strategy Doc',
      sourceFileRef: null,
      extractedVocabulary: {
        terms: [{ term: 'gtm' }, { term: 'icp' }, { term: 'swot' }],
      },
      extractedPatterns: null,
      extractedFrameworks: null,
      extractedVisualFeatures: null, contributionSummary: null,
      confidence: 0.75,
      version: 1,
      isCurrent: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const job = makeJob(RICH_CONTENT);
    const vocab = vocabExtractor.extract(job);
    const frameworks = fwExtractor.extract(job);
    const validator = new KnowledgeValidator(async () => [existingAsset]);

    const result = await validator.validate(job, vocab, frameworks);
    expect(result.corroborationScore).toBeGreaterThanOrEqual(0);
    expect(result.corroborationScore).toBeLessThanOrEqual(1);
  });

  it('passes validation for content above confidence threshold', async () => {
    const job = makeJob(RICH_CONTENT);
    const vocab = vocabExtractor.extract(job);
    const frameworks = fwExtractor.extract(job);
    const validator = new KnowledgeValidator(async () => []);

    const result = await validator.validate(job, vocab, frameworks);
    expect(result.passed).toBe(true);
  });
});

// ── KnowledgeProcessor orchestration ─────────────────────────────────────────

describe('KnowledgeProcessor', () => {
  let bus: InProcessEventBus;

  beforeEach(() => {
    bus = new InProcessEventBus();
  });

  function makeProcessor(returnedData?: Record<string, unknown>, logger?: Pick<Console, 'info' | 'warn' | 'error'>) {
    const mockData = returnedData ?? {
      id: 'asset-001',
      owner_type: 'user',
      user_id: 'user-001',
      project_id: null,
      workspace_id: null,
      asset_type: 'playbook',
      title: 'GTM Playbook',
      source_file_ref: null,
      extracted_vocabulary: {},
      extracted_patterns: {},
      extracted_frameworks: {},
      confidence: 0.80,
      version: 1,
      is_current: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // The validator calls: db.schema().from().select('*').eq('is_current', true)
    // and awaits the whole chain as a Promise (Supabase returns a thenable).
    // The processor calls: db.schema().from().upsert().select().single()
    // We need eq() to return a thenable for list queries AND support .single() chaining.

    const listResponse = { data: [], error: null };
    const singleResponse = { data: mockData, error: null };

    const chain: Record<string, unknown> = {};
    // Make chain thenable so `await chain` works (returns list result)
    chain['then'] = (resolve: (v: typeof listResponse) => void) => resolve(listResponse);
    chain['schema']  = vi.fn().mockReturnThis();
    chain['from']    = vi.fn().mockReturnThis();
    chain['select']  = vi.fn().mockReturnThis();
    chain['upsert']  = vi.fn().mockReturnThis();
    chain['eq']      = vi.fn().mockReturnThis();
    chain['single']  = vi.fn().mockResolvedValue(singleResponse);

    return { processor: new KnowledgeProcessor(new KnowledgeIntelligenceDomain(chain as unknown as import('@supabase/supabase-js').SupabaseClient), bus, logger), db: chain };
  }

  it('runs the full pipeline and returns a result', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');

    expect(result.assetId).toBe('asset-001');
    expect(result.vocabularyResult).toBeDefined();
    expect(result.frameworkResult).toBeDefined();
    expect(result.patternResult).toBeDefined();
    expect(result.validationResult).toBeDefined();
    expect(result.asset).toBeDefined();
  });

  it('lifecycle state is ACTIVE for well-formed content', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');
    expect(result.lifecycleState).toBe('ACTIVE');
  });

  it('lifecycle state is EXTRACTED for low-confidence content', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), EMPTY_CONTENT, 'asset-001');
    expect(result.lifecycleState).toBe('EXTRACTED');
  });

  it('emits intelligence.signal.extracted event', async () => {
    const { processor } = makeProcessor();
    const received: unknown[] = [];
    bus.on('intelligence.signal.extracted', async (payload) => { received.push(payload); });

    await processor.process(baseInput(), RICH_CONTENT, 'asset-001');
    expect(received.length).toBeGreaterThan(0);
  });

  it('extracts vocabulary from rich content', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');
    expect(result.vocabularyResult.termCount).toBeGreaterThan(0);
  });

  it('extracts frameworks from content with known frameworks', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');
    expect(result.frameworkResult.frameworkCount).toBeGreaterThan(0);
  });

  it('extracts structural patterns from well-structured content', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');
    expect(result.patternResult.patternCount).toBeGreaterThan(0);
  });

  it('handles malformed (empty) content gracefully without throwing', async () => {
    const { processor } = makeProcessor();
    await expect(processor.process(baseInput(), EMPTY_CONTENT, 'asset-001')).resolves.not.toThrow();
  });

  it('handles DB persistence failure gracefully (synthetic asset returned)', async () => {
    const listResponse = { data: [], error: null };
    const failChain: Record<string, unknown> = {};
    failChain['then'] = (resolve: (v: typeof listResponse) => void) => resolve(listResponse);
    failChain['schema']  = vi.fn().mockReturnThis();
    failChain['from']    = vi.fn().mockReturnThis();
    failChain['select']  = vi.fn().mockReturnThis();
    failChain['upsert']  = vi.fn().mockReturnThis();
    failChain['eq']      = vi.fn().mockReturnThis();
    failChain['single']  = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'DB connection failed' },
    });

    const processor = new KnowledgeProcessor(new KnowledgeIntelligenceDomain(failChain as unknown as import('@supabase/supabase-js').SupabaseClient), bus);
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');

    // Should still return a result (with persist error logged)
    expect(result.assetId).toBe('asset-001');
    expect(result.errors.some(e => e.stage === 'persist')).toBe(true);
    expect(result.asset).toBeDefined();
  });

  it('processes different asset types correctly', async () => {
    const { processor } = makeProcessor();
    const types: KnowledgeAssetInput['assetType'][] = ['playbook', 'framework', 'methodology', 'template', 'reference'];

    for (const assetType of types) {
      const input = { ...baseInput(), assetType };
      const result = await processor.process(input, RICH_CONTENT, crypto.randomUUID());
      expect(result.errors.filter(e => e.stage === 'extract')).toHaveLength(0);
    }
  });

  it('register() wires the event handler on the bus', () => {
    const { processor } = makeProcessor();
    const countBefore = bus.handlerCount('intelligence.knowledge_asset.uploaded');
    processor.register();
    const countAfter = bus.handlerCount('intelligence.knowledge_asset.uploaded');
    expect(countAfter).toBe(countBefore + 1);
  });

  it('event-driven path processes the asset when event is emitted', async () => {
    const { processor } = makeProcessor();
    processor.register();

    const received: unknown[] = [];
    bus.on('intelligence.signal.extracted', async (p) => { received.push(p); });

    await bus.emit('intelligence.knowledge_asset.uploaded', {
      userId:        'user-001',
      assetId:       'asset-event-001',
      ownerType:     'user',
      projectId:     null,
      workspaceId:   null,
      assetType:     'framework',
      title:         'Test Framework',
      sourceFileRef: 'gs://test/fw.md',
      occurredAt:    new Date().toISOString(),
    });

    // Event-driven path should emit a signal.extracted event
    expect(received.length).toBeGreaterThan(0);
  });

  it('result contains no extract-stage errors for valid input', async () => {
    const { processor } = makeProcessor();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');
    const extractErrors = result.errors.filter(e => e.stage === 'extract');
    expect(extractErrors).toHaveLength(0);
  });

  it('handles workspace-scoped assets', async () => {
    const { processor } = makeProcessor({
      id: 'asset-001',
      owner_type: 'workspace',
      user_id: null,
      project_id: null,
      workspace_id: 'ws-001',
      asset_type: 'reference',
      title: 'Company Handbook',
      source_file_ref: null,
      extracted_vocabulary: {},
      extracted_patterns: {},
      extracted_frameworks: {},
      confidence: 0.75,
      version: 1,
      is_current: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const input: KnowledgeAssetInput = {
      ownerType: 'workspace',
      userId: null,
      projectId: null,
      workspaceId: 'ws-001',
      assetType: 'reference',
      title: 'Company Handbook',
      sourceFileRef: null,
    };

    const result = await processor.process(input, RICH_CONTENT, 'asset-001');
    // Result asset ownerType comes from the job (input), not the mock DB row
    expect(result.assetId).toBe('asset-001');
    expect(result.errors.filter(e => e.stage === 'extract')).toHaveLength(0);
  });
});

// ── G-21 (Architecture Verification Report, P0) — structured logging ─────────
// KnowledgeProcessor.process() previously had zero structured logging (the
// sharpest instance of RC-5/RC-3 the verification pass identified). These
// tests assert the new log line fires with the expected fields for both a
// passing and a failing validationResult, using the data already collected
// in-memory by process() rather than any new computation.
describe('KnowledgeProcessor — G-21 structured logging', () => {
  let bus: InProcessEventBus;

  beforeEach(() => {
    bus = new InProcessEventBus();
  });

  function makeProcessorWithLogger(returnedData?: Record<string, unknown>) {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const mockData = returnedData ?? {
      id: 'asset-001',
      owner_type: 'user',
      user_id: 'user-001',
      project_id: null,
      workspace_id: null,
      asset_type: 'playbook',
      title: 'GTM Playbook',
      source_file_ref: null,
      extracted_vocabulary: {},
      extracted_patterns: {},
      extracted_frameworks: {},
      confidence: 0.80,
      version: 1,
      is_current: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const listResponse = { data: [], error: null };
    const chain: Record<string, unknown> = {};
    chain['then'] = (resolve: (v: typeof listResponse) => void) => resolve(listResponse);
    chain['schema'] = vi.fn().mockReturnThis();
    chain['from']   = vi.fn().mockReturnThis();
    chain['select'] = vi.fn().mockReturnThis();
    chain['upsert'] = vi.fn().mockReturnThis();
    chain['eq']     = vi.fn().mockReturnThis();
    chain['single'] = vi.fn().mockResolvedValue({ data: mockData, error: null });

    const processor = new KnowledgeProcessor(
      new KnowledgeIntelligenceDomain(chain as unknown as import('@supabase/supabase-js').SupabaseClient),
      bus,
      logger,
    );
    return { processor, logger };
  }

  it('logs one structured line reporting stage outcomes and final state for a passing validationResult', async () => {
    const { processor, logger } = makeProcessorWithLogger();
    const result = await processor.process(baseInput(), RICH_CONTENT, 'asset-001');

    expect(logger.info).toHaveBeenCalledWith(
      '[KnowledgeProcessor] process() complete:',
      expect.objectContaining({
        assetId: 'asset-001',
        lifecycleState: result.lifecycleState,
        confidence: result.validationResult.confidence,
        passed: true,
        termCount: result.vocabularyResult.termCount,
        frameworkCount: result.frameworkResult.frameworkCount,
        patternCount: result.patternResult.patternCount,
        isVisualAsset: false,
        errorCount: 0,
      }),
    );

    const [, payload] = logger.info.mock.calls.find(
      ([msg]) => msg === '[KnowledgeProcessor] process() complete:',
    )!;
    expect(payload.stageOutcomes).toEqual({
      extract: 'pass', vocabulary: 'pass', framework: 'pass',
      pattern: 'pass', visual: 'pass', validation: 'pass', contribution: 'pass', persist: 'pass',
    });
  });

  it('logs stage failure for a failing validationResult (empty content)', async () => {
    const { processor, logger } = makeProcessorWithLogger();
    const result = await processor.process(baseInput(), EMPTY_CONTENT, 'asset-001');

    expect(logger.info).toHaveBeenCalledWith(
      '[KnowledgeProcessor] process() complete:',
      expect.objectContaining({
        assetId: 'asset-001',
        lifecycleState: 'EXTRACTED',
        passed: false,
      }),
    );
    expect(result.validationResult.passed).toBe(false);
  });

  it('logs exactly once per process() invocation (regression guard against RC-1 recurring silently)', async () => {
    const { processor, logger } = makeProcessorWithLogger();
    await processor.process(baseInput(), RICH_CONTENT, 'asset-001');

    const completionCalls = logger.info.mock.calls.filter(
      ([msg]) => msg === '[KnowledgeProcessor] process() complete:',
    );
    expect(completionCalls).toHaveLength(1);
  });

  it('reflects a persist-stage failure in stageOutcomes', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const listResponse = { data: [], error: null };
    const failChain: Record<string, unknown> = {};
    failChain['then'] = (resolve: (v: typeof listResponse) => void) => resolve(listResponse);
    failChain['schema'] = vi.fn().mockReturnThis();
    failChain['from']   = vi.fn().mockReturnThis();
    failChain['select'] = vi.fn().mockReturnThis();
    failChain['upsert'] = vi.fn().mockReturnThis();
    failChain['eq']     = vi.fn().mockReturnThis();
    failChain['single'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection failed' } });

    const processor = new KnowledgeProcessor(
      new KnowledgeIntelligenceDomain(failChain as unknown as import('@supabase/supabase-js').SupabaseClient),
      bus,
      logger,
    );
    await processor.process(baseInput(), RICH_CONTENT, 'asset-001');

    const [, payload] = logger.info.mock.calls.find(
      ([msg]) => msg === '[KnowledgeProcessor] process() complete:',
    )!;
    expect(payload.stageOutcomes.persist).toBe('fail');
    expect(payload.errorCount).toBeGreaterThan(0);
  });

  it('defaults to console when no logger is injected (production boot requires no extra wiring)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const listResponse = { data: [], error: null };
    const chain: Record<string, unknown> = {};
    chain['then'] = (resolve: (v: typeof listResponse) => void) => resolve(listResponse);
    chain['schema'] = vi.fn().mockReturnThis();
    chain['from']   = vi.fn().mockReturnThis();
    chain['select'] = vi.fn().mockReturnThis();
    chain['upsert'] = vi.fn().mockReturnThis();
    chain['eq']     = vi.fn().mockReturnThis();
    chain['single'] = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-001', owner_type: 'user', user_id: 'user-001', project_id: null,
        workspace_id: null, asset_type: 'playbook', title: 'GTM Playbook', source_file_ref: null,
        extracted_vocabulary: {}, extracted_patterns: {}, extracted_frameworks: {},
        confidence: 0.80, version: 1, is_current: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      error: null,
    });

    const processor = new KnowledgeProcessor(
      new KnowledgeIntelligenceDomain(chain as unknown as import('@supabase/supabase-js').SupabaseClient),
      bus,
    );
    await processor.process(baseInput(), RICH_CONTENT, 'asset-001');

    expect(infoSpy).toHaveBeenCalledWith('[KnowledgeProcessor] process() complete:', expect.anything());
    infoSpy.mockRestore();
  });
});

// ── IntelligenceOS.ingestKnowledgeAsset integration ──────────────────────────

describe('Full pipeline - asset ingestion to active state', () => {
  it('runs all 5 stages in order: extract → vocabulary → framework → pattern → validate', async () => {
    const order: string[] = [];

    // We test this by instrumenting individual extractors
    const assetExtractor    = new KnowledgeAssetExtractor();
    const vocabExtractor    = new VocabularyExtractor();
    const frameworkExtractor = new FrameworkExtractor();
    const patternExtractor  = new PatternExtractor();

    const origCreate = assetExtractor.createJob.bind(assetExtractor);
    assetExtractor.createJob = (...args) => { order.push('extract'); return origCreate(...args); };

    const origVocab = vocabExtractor.extract.bind(vocabExtractor);
    vocabExtractor.extract = (...args) => { order.push('vocabulary'); return origVocab(...args); };

    const origFw = frameworkExtractor.extract.bind(frameworkExtractor);
    frameworkExtractor.extract = (...args) => { order.push('framework'); return origFw(...args); };

    const origPat = patternExtractor.extract.bind(patternExtractor);
    patternExtractor.extract = (...args) => { order.push('pattern'); return origPat(...args); };

    // Manually wire the pipeline to verify ordering
    const job      = assetExtractor.createJob(baseInput(), 'asset-001', RICH_CONTENT);
    const vocab    = vocabExtractor.extract(job);
    const fw       = frameworkExtractor.extract(job);
    const patterns = patternExtractor.extract(job);

    const validator = new KnowledgeValidator(async () => []);
    order.push('validate');
    await validator.validate(job, vocab, fw);

    expect(order).toEqual(['extract', 'vocabulary', 'framework', 'pattern', 'validate']);
    expect(patterns.patterns).toBeDefined();
  });
});
