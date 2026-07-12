/**
 * StructurePlanner.ts
 *
 * Selects artifact structure, section ordering, and depth calibration.
 *
 * Priority for structure source:
 *   1. User-calibrated pattern (if userId matches a pattern)
 *   2. Archetype-level pattern (if archetypeType matches)
 *   3. Universal seeded pattern (always present for the 5 core artifact types)
 *   4. FALLBACK_SECTIONS (3 generic sections — for unknown/custom artifact types)
 *
 * Depth calibration:
 *   Driven by audience expertise level and project lifecycle state.
 *   ACTIVE project + expert audience → deep
 *   IDEATION/ARCHIVED project OR general audience → summary
 *   Otherwise → standard
 *
 *   Section-level depth is additionally capped at the document-level depth
 *   (a section cannot be "deep" in a "summary" document).
 *
 * Never throws. Missing pattern → fallback sections.
 */

import type { BlueprintSection, DepthSpecification } from '@intelligence-os/shared-types';
import type { ArtifactIntelligenceDomain } from '../domains/ArtifactIntelligenceDomain';
import type { AudienceCalibration } from '@intelligence-os/shared-types';
import type { ArtifactPattern } from '../types/entities';
import type { ProjectContext } from './ProjectContextBuilder';
import { FALLBACK_SECTIONS, DEFAULT_DEPTH_SPEC } from './internal/defaults';

export interface StructurePlan {
  sections:        BlueprintSection[];
  depthSpec:       DepthSpecification;
  /** ID of the ArtifactPattern that was used, or null when using fallback. */
  sourcePatternId: string | null;
}

// Word-count envelope per effective depth level
const WORD_COUNT: Record<string, { min: number; max: number }> = {
  summary:  { min: 50,  max: 150 },
  standard: { min: 100, max: 350 },
  deep:     { min: 200, max: 600 },
};

// Depth rank for capping (lower = shallower)
const DEPTH_RANK: Record<string, number> = { summary: 0, standard: 1, deep: 2 };
const DEPTH_FROM_RANK: ('summary' | 'standard' | 'deep')[] = ['summary', 'standard', 'deep'];

export class StructurePlanner {
  constructor(private readonly artifactDomain: ArtifactIntelligenceDomain) {}

  async plan(
    artifactType:        string,
    userId:              string,
    archetypeType:       string | null,
    audienceCalibration: AudienceCalibration,
    projectContext:      ProjectContext,
  ): Promise<StructurePlan> {
    const pattern = await this.artifactDomain
      .getPattern(artifactType, userId, archetypeType ?? undefined)
      .catch(() => null);

    const depthSpec = this.calculateDepth(audienceCalibration, projectContext);

    const sections = pattern
      ? this.sectionsFromPattern(pattern, depthSpec)
      : this.fallbackSections(depthSpec);

    return {
      sections,
      depthSpec,
      sourcePatternId: pattern?.id ?? null,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private calculateDepth(
    audienceCalibration: AudienceCalibration,
    projectContext:      ProjectContext,
  ): DepthSpecification {
    const expertise       = audienceCalibration.expertiseLevel;
    const lifecycleState  = projectContext.lifecycleState;

    let level: 'summary' | 'standard' | 'deep';

    if (expertise === 'expert' && lifecycleState === 'ACTIVE') {
      level = 'deep';
    } else if (
      expertise === 'general' ||
      lifecycleState === 'ARCHIVED' ||
      lifecycleState === 'IDEATION'
    ) {
      level = 'summary';
    } else {
      level = 'standard';
    }

    return {
      level,
      // Extended fields document the basis for the decision (transparent to callers).
      expertiseLevelBasis: expertise,
      lifecycleStateBasis: lifecycleState ?? 'none',
    };
  }

  /**
   * Converts pattern.sections JSONB to BlueprintSection[].
   *
   * Pattern sections JSONB shape (from schema.sql seed):
   *   { "sections": [{ id, title, purpose, depthLevel }] }
   */
  private sectionsFromPattern(
    pattern:   ArtifactPattern,
    depthSpec: DepthSpecification,
  ): BlueprintSection[] {
    const raw = pattern.sections['sections'];

    if (!Array.isArray(raw) || raw.length === 0) {
      return this.fallbackSections(depthSpec);
    }

    return (raw as Record<string, unknown>[]).map((item, index) => {
      const patternDepth = (item['depthLevel'] as string) ?? 'standard';
      const effectiveDepth = this.capDepth(patternDepth, depthSpec.level);
      const wc = WORD_COUNT[effectiveDepth] ?? WORD_COUNT['standard']!;

      return {
        id:           (item['id'] as string)    ?? `section_${index}`,
        title:        (item['title'] as string)  ?? `Section ${index + 1}`,
        purpose:      (item['purpose'] as string) ?? '',
        depthLevel:   effectiveDepth,
        wordCountMin: wc.min,
        wordCountMax: wc.max,
        evidenceType: this.inferEvidenceType((item['purpose'] as string) ?? ''),
      };
    });
  }

  private fallbackSections(depthSpec: DepthSpecification): BlueprintSection[] {
    return FALLBACK_SECTIONS.map(s => {
      const effectiveDepth = this.capDepth(s.depthLevel, depthSpec.level);
      const wc = WORD_COUNT[effectiveDepth] ?? WORD_COUNT['standard']!;
      return {
        ...s,
        depthLevel:   effectiveDepth,
        wordCountMin: wc.min,
        wordCountMax: wc.max,
      };
    });
  }

  /**
   * A section's depth level can never exceed the document's overall depth.
   * e.g., a "deep" section in a "summary" document becomes "summary".
   */
  private capDepth(
    sectionDepth: string,
    overallLevel: 'summary' | 'standard' | 'deep',
  ): 'summary' | 'standard' | 'deep' {
    const sRank = DEPTH_RANK[sectionDepth] ?? 1;
    const oRank = DEPTH_RANK[overallLevel] ?? 1;
    return DEPTH_FROM_RANK[Math.min(sRank, oRank)] ?? 'standard';
  }

  private inferEvidenceType(
    purpose: string,
  ): 'data' | 'narrative' | 'example' | 'mixed' {
    const p = purpose.toLowerCase();
    if (p.includes('metric') || p.includes('kpi') || p.includes('data') || p.includes('number')) return 'data';
    if (p.includes('story') || p.includes('context') || p.includes('background'))                 return 'narrative';
    if (p.includes('example') || p.includes('case') || p.includes('illustration'))                return 'example';
    return 'mixed';
  }
}
