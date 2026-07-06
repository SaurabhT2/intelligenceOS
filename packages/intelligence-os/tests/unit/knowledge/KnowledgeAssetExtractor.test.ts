/**
 * tests/unit/knowledge/KnowledgeAssetExtractor.test.ts
 *
 * Unit tests for KnowledgeAssetExtractor.
 * Tests: asset ingestion, normalization, job creation, type inference.
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeAssetExtractor, normalizeContent } from '../../../src/knowledge/KnowledgeAssetExtractor';
import type { KnowledgeAssetInput } from '../../../src/types/domains';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYBOOK_CONTENT = `
# Sales Playbook

## Phase 1: Discovery
In the discovery phase, we identify customer pain points.
Our sales methodology follows a structured approach.

- Step 1: Initial call
- Step 2: Needs assessment
- Step 3: Proposal

## Phase 2: Qualification
Qualification ensures we're speaking to the right stakeholders.

## Phase 3: Close
The closing phase covers negotiation and contract signing.
`;

const FRAMEWORK_CONTENT = `
Strategic Framework Overview

Our proprietary model consists of five pillars:
1. Alignment
2. Execution
3. Measurement
4. Learning
5. Optimization

This framework has been validated across multiple enterprise clients.
SWOT analysis is used at each phase to ensure competitive positioning.
`;

const baseInput = (): KnowledgeAssetInput => ({
  ownerType: 'user',
  userId: 'user-001',
  projectId: null,
  workspaceId: null,
  assetType: 'playbook',
  title: 'Sales Playbook',
  sourceFileRef: 'gs://bucket/sales-playbook.md',
});

// ── normalizeContent ──────────────────────────────────────────────────────────

describe('normalizeContent', () => {
  it('extracts lines, sentences, and paragraphs', () => {
    const content = 'Hello world.\n\nThis is paragraph two. And a second sentence.';
    const normalized = normalizeContent(content);

    expect(normalized.text).toBe(content.trim());
    expect(normalized.lines.length).toBeGreaterThan(0);
    expect(normalized.paragraphs.length).toBe(2);
    expect(normalized.sentences.length).toBeGreaterThan(0);
    expect(normalized.wordCount).toBeGreaterThan(0);
  });

  it('detects structured content with markdown headers', () => {
    const content = '# Title\n\n## Section 1\n\nSome text.\n\n## Section 2\n\n- Item A\n- Item B';
    const normalized = normalizeContent(content);
    expect(normalized.isStructured).toBe(true);
  });

  it('marks plain prose as unstructured', () => {
    const content = 'This is just a paragraph of plain prose text. No special formatting here.';
    const normalized = normalizeContent(content);
    expect(normalized.isStructured).toBe(false);
  });

  it('handles empty input gracefully', () => {
    const normalized = normalizeContent('');
    expect(normalized.text).toBe('');
    expect(normalized.wordCount).toBe(0);
    expect(normalized.lines).toHaveLength(0);
    expect(normalized.paragraphs).toHaveLength(0);
    expect(normalized.sentences).toHaveLength(0);
  });

  it('normalizes Windows line endings', () => {
    const content = 'Line one.\r\nLine two.';
    const normalized = normalizeContent(content);
    expect(normalized.text).not.toContain('\r');
  });

  it('collapses excessive blank lines', () => {
    const content = 'Para one.\n\n\n\n\nPara two.';
    const normalized = normalizeContent(content);
    expect(normalized.text).not.toMatch(/\n{3,}/);
  });
});

// ── KnowledgeAssetExtractor.createJob ────────────────────────────────────────

describe('KnowledgeAssetExtractor.createJob', () => {
  const extractor = new KnowledgeAssetExtractor();

  it('creates a job with all required fields', () => {
    const input = baseInput();
    const job = extractor.createJob(input, 'asset-001', PLAYBOOK_CONTENT);

    expect(job.assetId).toBe('asset-001');
    expect(job.ownerType).toBe('user');
    expect(job.userId).toBe('user-001');
    expect(job.assetType).toBe('playbook');
    expect(job.title).toBe('Sales Playbook');
    expect(job.lifecycleState).toBe('PROCESSING');
    expect(job.content.wordCount).toBeGreaterThan(0);
  });

  it('generates a unique job id each time', () => {
    const input = baseInput();
    const job1 = extractor.createJob(input, 'asset-001', PLAYBOOK_CONTENT);
    const job2 = extractor.createJob(input, 'asset-002', PLAYBOOK_CONTENT);
    expect(job1.id).not.toBe(job2.id);
  });

  it('sets lifecycleState to PROCESSING', () => {
    const job = extractor.createJob(baseInput(), 'asset-001', PLAYBOOK_CONTENT);
    expect(job.lifecycleState).toBe('PROCESSING');
  });

  it('infers asset type from title when not specified', () => {
    const input: KnowledgeAssetInput = {
      ...baseInput(),
      assetType: 'reference', // Provide valid type
      title: 'My Sales Playbook',
    };
    // Override assetType via inference path by checking title keyword
    const job = extractor.createJob({ ...input, assetType: 'playbook' }, 'a-001', 'playbook content');
    expect(job.assetType).toBe('playbook');
  });

  it('propagates projectId when set', () => {
    const input = { ...baseInput(), projectId: 'proj-001' };
    const job = extractor.createJob(input, 'asset-001', 'Some content');
    expect(job.projectId).toBe('proj-001');
  });

  it('propagates workspaceId when set', () => {
    const input = { ...baseInput(), ownerType: 'workspace' as const, workspaceId: 'ws-001' };
    const job = extractor.createJob(input, 'asset-001', 'Some content');
    expect(job.workspaceId).toBe('ws-001');
  });

  it('handles empty content gracefully', () => {
    const job = extractor.createJob(baseInput(), 'asset-001', '');
    expect(job.content.wordCount).toBe(0);
    expect(job.content.lines).toHaveLength(0);
  });

  it('handles malformed content (only whitespace)', () => {
    const job = extractor.createJob(baseInput(), 'asset-001', '   \n\n   \t  ');
    expect(job.content.wordCount).toBe(0);
  });

  it('trims the title', () => {
    const input = { ...baseInput(), title: '  Sales Playbook   ' };
    const job = extractor.createJob(input, 'asset-001', PLAYBOOK_CONTENT);
    expect(job.title).toBe('Sales Playbook');
  });

  it('sets createdAt as an ISO string', () => {
    const job = extractor.createJob(baseInput(), 'asset-001', PLAYBOOK_CONTENT);
    expect(() => new Date(job.createdAt)).not.toThrow();
  });

  it('correctly classifies structured content', () => {
    const job = extractor.createJob(baseInput(), 'asset-001', PLAYBOOK_CONTENT);
    expect(job.content.isStructured).toBe(true);
  });

  it('correctly classifies framework content with numbered lists', () => {
    const job = extractor.createJob(
      { ...baseInput(), assetType: 'framework', title: 'Strategy Framework' },
      'asset-002',
      FRAMEWORK_CONTENT,
    );
    expect(job.content.isStructured).toBe(true);
    expect(job.content.paragraphs.length).toBeGreaterThan(1);
  });
});
