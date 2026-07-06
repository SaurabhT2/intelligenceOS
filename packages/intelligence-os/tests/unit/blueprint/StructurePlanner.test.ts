/**
 * StructurePlanner.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { StructurePlanner } from '../../../src/blueprint/StructurePlanner';
import { EMPTY_PROJECT_CONTEXT } from '../../../src/blueprint/ProjectContextBuilder';
import type { ArtifactPattern } from '../../../src/types/entities';
import type { AudienceCalibration } from '@intelligence-os/shared-types';
import type { ProjectContext } from '../../../src/blueprint/ProjectContextBuilder';

// ── Fixture data ──────────────────────────────────────────────────────────────

const BOARD_PATTERN: ArtifactPattern = {
  id:           'pat-1',
  artifactType: 'board_update',
  patternLevel: 'universal',
  userId:       null,
  archetypeType: null,
  confidence:   0.5,
  sections: {
    sections: [
      { id: 'exec_summary',     title: 'Executive Summary',  purpose: 'Key metric in 3 sentences', depthLevel: 'summary'  },
      { id: 'metrics_progress', title: 'Metrics & Progress', purpose: 'KPIs vs targets with data', depthLevel: 'standard' },
      { id: 'decisions_needed', title: 'Decisions Needed',   purpose: 'Items requiring board input', depthLevel: 'standard' },
      { id: 'risks',            title: 'Risks',              purpose: 'Top risks with context',     depthLevel: 'standard' },
      { id: 'next_period',      title: 'Next Period Plan',   purpose: 'Commitments for next cycle', depthLevel: 'summary'  },
    ],
  },
  narrativeModel:          { frame: 'headline-first' },
  lengthBaseline:          null,
  toneModel:               null,
  exemplarCount:           0,
  knownRejectionTriggers:  [],
  createdAt:               new Date(),
  updatedAt:               new Date(),
};

const EXPERT_ACTIVE_AUDIENCE: AudienceCalibration = {
  isNamedRelationship: false,
  audienceType:        'engineering',
  expertiseLevel:      'expert',
  communicationNorms:  {},
  knownSensitivities:  {},
  confidence:          0.5,
};

const GENERAL_AUDIENCE: AudienceCalibration = {
  isNamedRelationship: false,
  audienceType:        'general',
  expertiseLevel:      'general',
  communicationNorms:  {},
  knownSensitivities:  {},
  confidence:          0.1,
};

const BOARD_AUDIENCE: AudienceCalibration = {
  isNamedRelationship: false,
  audienceType:        'board',
  expertiseLevel:      'practitioner',
  communicationNorms:  {},
  knownSensitivities:  {},
  confidence:          0.5,
};

function projectCtx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return { ...EMPTY_PROJECT_CONTEXT, ...overrides };
}

function makeDomain(pattern: ArtifactPattern | null) {
  return { getPattern: vi.fn().mockResolvedValue(pattern) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StructurePlanner', () => {

  describe('sections from pattern', () => {
    it('extracts sections from a seeded universal pattern', async () => {
      const planner = new StructurePlanner(makeDomain(BOARD_PATTERN) as any);
      const plan = await planner.plan('board_update', 'u1', null, BOARD_AUDIENCE, projectCtx());
      expect(plan.sections).toHaveLength(5);
      expect(plan.sections[0]!.id).toBe('exec_summary');
      expect(plan.sections[0]!.title).toBe('Executive Summary');
      expect(plan.sourcePatternId).toBe('pat-1');
    });

    it('infers evidenceType "data" for metric-focused purposes', async () => {
      const planner = new StructurePlanner(makeDomain(BOARD_PATTERN) as any);
      const plan = await planner.plan('board_update', 'u1', null, BOARD_AUDIENCE, projectCtx());
      const metricsSection = plan.sections.find(s => s.id === 'metrics_progress');
      expect(metricsSection?.evidenceType).toBe('data');
    });

    it('sets wordCountMin and wordCountMax on every section', async () => {
      const planner = new StructurePlanner(makeDomain(BOARD_PATTERN) as any);
      const plan = await planner.plan('board_update', 'u1', null, BOARD_AUDIENCE, projectCtx());
      for (const section of plan.sections) {
        expect(section.wordCountMin).toBeTypeOf('number');
        expect(section.wordCountMax).toBeTypeOf('number');
        expect(section.wordCountMax!).toBeGreaterThan(section.wordCountMin!);
      }
    });
  });

  describe('fallback sections (no pattern)', () => {
    it('returns 3 fallback sections when no pattern exists', async () => {
      const planner = new StructurePlanner(makeDomain(null) as any);
      const plan = await planner.plan('unknown_type', 'u1', null, GENERAL_AUDIENCE, projectCtx());
      expect(plan.sections).toHaveLength(3);
      expect(plan.sections[0]!.id).toBe('context');
      expect(plan.sourcePatternId).toBeNull();
    });

    it('returns fallback sections when pattern has empty sections array', async () => {
      const emptyPattern: ArtifactPattern = {
        ...BOARD_PATTERN,
        id:       'pat-empty',
        sections: { sections: [] },
      };
      const planner = new StructurePlanner(makeDomain(emptyPattern) as any);
      const plan = await planner.plan('board_update', 'u1', null, GENERAL_AUDIENCE, projectCtx());
      expect(plan.sections).toHaveLength(3);
    });

    it('does not throw when domain call fails', async () => {
      const domain = { getPattern: vi.fn().mockRejectedValue(new Error('DB error')) };
      const planner = new StructurePlanner(domain as any);
      const plan = await planner.plan('board_update', 'u1', null, GENERAL_AUDIENCE, projectCtx());
      expect(plan.sections).toHaveLength(3);
      expect(plan.sourcePatternId).toBeNull();
    });
  });

  describe('depth calibration', () => {
    it('produces "deep" for expert audience + ACTIVE project', async () => {
      const planner = new StructurePlanner(makeDomain(null) as any);
      const ctx = projectCtx({ lifecycleState: 'ACTIVE' });
      const plan = await planner.plan('strategy_document', 'u1', null, EXPERT_ACTIVE_AUDIENCE, ctx);
      expect(plan.depthSpec.level).toBe('deep');
    });

    it('produces "summary" for general audience', async () => {
      const planner = new StructurePlanner(makeDomain(null) as any);
      const plan = await planner.plan('linkedin_post', 'u1', null, GENERAL_AUDIENCE, projectCtx());
      expect(plan.depthSpec.level).toBe('summary');
    });

    it('produces "summary" for IDEATION lifecycle state', async () => {
      const planner = new StructurePlanner(makeDomain(null) as any);
      const ctx = projectCtx({ lifecycleState: 'IDEATION' });
      const plan = await planner.plan('strategy_document', 'u1', null, BOARD_AUDIENCE, ctx);
      expect(plan.depthSpec.level).toBe('summary');
    });

    it('produces "summary" for ARCHIVED lifecycle state', async () => {
      const planner = new StructurePlanner(makeDomain(null) as any);
      const ctx = projectCtx({ lifecycleState: 'ARCHIVED' });
      const plan = await planner.plan('strategy_document', 'u1', null, BOARD_AUDIENCE, ctx);
      expect(plan.depthSpec.level).toBe('summary');
    });

    it('produces "standard" for practitioner audience + ACTIVE project', async () => {
      const planner = new StructurePlanner(makeDomain(null) as any);
      const ctx = projectCtx({ lifecycleState: 'ACTIVE' });
      const plan = await planner.plan('board_update', 'u1', null, BOARD_AUDIENCE, ctx);
      expect(plan.depthSpec.level).toBe('standard');
    });

    it('caps section depth at document depth', async () => {
      // Board_update has standard/deep sections; summary document should cap all to summary
      const planner = new StructurePlanner(makeDomain(BOARD_PATTERN) as any);
      const plan = await planner.plan('board_update', 'u1', null, GENERAL_AUDIENCE, projectCtx());
      expect(plan.depthSpec.level).toBe('summary');
      for (const section of plan.sections) {
        expect(section.depthLevel).toBe('summary');
      }
    });
  });

  describe('domain call arguments', () => {
    it('passes userId and archetypeType to getPattern', async () => {
      const domain = makeDomain(null);
      const planner = new StructurePlanner(domain as any);
      await planner.plan('board_update', 'u1', 'founder', BOARD_AUDIENCE, projectCtx());
      expect(domain.getPattern).toHaveBeenCalledWith('board_update', 'u1', 'founder');
    });

    it('passes undefined archetypeType when archetypeType is null', async () => {
      const domain = makeDomain(null);
      const planner = new StructurePlanner(domain as any);
      await planner.plan('board_update', 'u1', null, BOARD_AUDIENCE, projectCtx());
      expect(domain.getPattern).toHaveBeenCalledWith('board_update', 'u1', undefined);
    });
  });
});
