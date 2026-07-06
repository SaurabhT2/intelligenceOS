/**
 * NarrativePlanner.ts
 *
 * Assembles the narrative and voice layer of the blueprint.
 *
 * Responsible for:
 *   NarrativeFrame    — how the artifact opens, argues, and closes
 *   VoiceDirectives   — register, tone, rhythm, style, avoidPatterns
 *   VocabularyDirectives — preferred/forbidden terms, jargon, proprietary terms
 *
 * Authority ordering applied here for voice (E1-2 Phase C):
 *   1. Audience register (RECIPIENT rule) overrides all registers for delivery
 *   2. Workspace brand voice (shared across all users in the workspace)
 *   3. User tone from profile.voiceSummary (individual voice, below workspace)
 *   4. Archetype voice tendency (applied when no profile data)
 *   5. System defaults
 *
 * This maps to the documented 4-level resolution hierarchy:
 *   workspace brand > user voice > archetype default > system default
 *
 * The RECIPIENT rule (audience register) sits above all of these —
 * it governs delivery register, not voice identity.
 *
 * Vocabulary ordering:
 *   1. Workspace preferredTerms override all (workspace brand vocabulary)
 *   2. Project preferredTerms override user preferredTerms (PROJECT_CONTEXT > USER)
 *   3. All forbidden terms are unioned (workspace + user + project — all apply)
 *   4. Proprietary terms from knowledge assets (extracted vocabulary)
 *
 * Synchronous — all intelligence is pre-loaded by BlueprintBuilder before this call.
 * Never throws.
 */

import type {
  NarrativeFrame,
  VoiceDirectives,
  VocabularyDirectives,
} from '@intelligence-os/shared-types';
import type { AudienceCalibration } from '@intelligence-os/shared-types';
import type { IntelligenceProfile, Archetype } from '../types/entities';
import type { Learning } from '../types/entities';
import type { ProjectContext } from './ProjectContextBuilder';
import {
  DEFAULT_VOICE_DIRECTIVES,
  DEFAULT_VOCABULARY_DIRECTIVES,
  AUDIENCE_TYPE_DEFAULTS,
  ARCHETYPE_VOICE_DEFAULTS,
  getNarrativeFrame,
} from './internal/defaults';

export interface NarrativePlan {
  narrativeFrame:       NarrativeFrame;
  voiceDirectives:      VoiceDirectives;
  vocabularyDirectives: VocabularyDirectives;
}

export class NarrativePlanner {
  /**
   * Plans the full narrative layer.
   *
   * Resolution hierarchy for voice:
   *   workspace brand > user voice > archetype default > system default
   *
   * The RECIPIENT rule (audience register) sits above all of these and
   * governs delivery register independently of voice identity.
   *
   * @param artifactType        The artifact type being built (e.g. 'board_update')
   * @param profile             Current user intelligence profile, or null
   * @param archetype           Current user archetype, or null
   * @param audienceCalibration Calibrated audience intelligence
   * @param projectContext      Project-scoped intelligence
   * @param workspaceLearnings  Active workspace-level brand voice learnings (E1-2 Phase C).
   *                            When present, these take precedence over user voice for
   *                            shared brand identity signals. Only INFERRED style patterns
   *                            (e.g. consistently shorter copy across the workspace) belong
   *                            here — declared compliance constraints live in
   *                            WorkspaceIntelligenceDomain.getContext().complianceConstraints
   *                            and must not arrive via this parameter.
   */
  plan(
    artifactType:        string,
    profile:             IntelligenceProfile | null,
    archetype:           Archetype | null,
    audienceCalibration: AudienceCalibration,
    projectContext:      ProjectContext,
    workspaceLearnings:  Learning[] = [],
  ): NarrativePlan {
    return {
      narrativeFrame:       this.buildNarrativeFrame(artifactType, audienceCalibration),
      voiceDirectives:      this.buildVoiceDirectives(profile, archetype, audienceCalibration, workspaceLearnings),
      vocabularyDirectives: this.buildVocabularyDirectives(profile, projectContext, workspaceLearnings),
    };
  }

  // ── Narrative Frame ───────────────────────────────────────────────────────

  private buildNarrativeFrame(
    artifactType:        string,
    audienceCalibration: AudienceCalibration,
  ): NarrativeFrame {
    return getNarrativeFrame(artifactType, audienceCalibration.audienceType);
  }

  // ── Voice Directives ──────────────────────────────────────────────────────

  private buildVoiceDirectives(
    profile:             IntelligenceProfile | null,
    archetype:           Archetype | null,
    audienceCalibration: AudienceCalibration,
    workspaceLearnings:  Learning[],
  ): VoiceDirectives {
    const audienceKey      = audienceCalibration.audienceType ?? 'general';
    const audienceDefaults = AUDIENCE_TYPE_DEFAULTS[audienceKey] ?? AUDIENCE_TYPE_DEFAULTS['general']!;
    const archetypeVoice   = archetype ? (ARCHETYPE_VOICE_DEFAULTS[archetype.archetypeType] ?? {}) : {};

    // ── Workspace brand voice (E1-2 Phase C) ─────────────────────────────────
    // Extract inferred style signals from workspace learnings.
    // Resolution: workspace brand voice overrides user voice for shared brand signals.
    // Only 'brand_voice' domain learnings with voice-relevant content are applied.
    const workspaceVoice = extractWorkspaceVoice(workspaceLearnings);

    // Register: audience wins (RECIPIENT rule — highest authority for delivery).
    // ConflictResolutionModel documents this as a REGISTER conflict when the
    // user's stored register differs; the user sees a transparency note.
    const register = audienceDefaults.register;

    // Tone: 4-level resolution hierarchy.
    //   workspace brand tone > user tone > archetype tone > audience defaults
    // Tone is additive across levels; workspace signals appear first to give
    // them precedence in the final slice (max 5 items).
    const workspaceTone = workspaceVoice.tone;
    const userTone      = (profile?.voiceSummary?.['tone'] as string[] | undefined) ?? [];
    const archetypeTone = (archetypeVoice.tone ?? []) as string[];
    const audienceTone  = audienceDefaults.tone;
    const mergedTone    = dedupe([...workspaceTone, ...userTone, ...archetypeTone, ...audienceTone]).slice(0, 5);

    // Sentence rhythm: workspace > user > archetype > system default.
    const sentenceRhythm = (
      workspaceVoice.sentenceRhythm ??
      (profile?.voiceSummary?.['sentenceRhythm'] as VoiceDirectives['sentenceRhythm'] | undefined) ??
      (archetypeVoice.sentenceRhythm as VoiceDirectives['sentenceRhythm'] | undefined) ??
      DEFAULT_VOICE_DIRECTIVES.sentenceRhythm
    );

    // Paragraph style: workspace > user > system default.
    const paragraphStyle = (
      workspaceVoice.paragraphStyle ??
      (profile?.voiceSummary?.['paragraphStyle'] as VoiceDirectives['paragraphStyle'] | undefined) ??
      DEFAULT_VOICE_DIRECTIVES.paragraphStyle
    );

    // avoidPatterns: union of workspace and user rejection vocabulary.
    const workspaceAvoid = workspaceVoice.avoidPatterns;
    const userAvoid      = (profile?.vocabularySnapshot?.['forbiddenTerms'] as string[] | undefined) ?? [];
    const avoidPatterns  = dedupe([...workspaceAvoid, ...userAvoid]);

    return {
      register,
      tone:           mergedTone.length > 0 ? mergedTone : DEFAULT_VOICE_DIRECTIVES.tone,
      sentenceRhythm,
      paragraphStyle,
      avoidPatterns,
    };
  }

  // ── Vocabulary Directives ─────────────────────────────────────────────────

  private buildVocabularyDirectives(
    profile:            IntelligenceProfile | null,
    projectContext:     ProjectContext,
    workspaceLearnings: Learning[],
  ): VocabularyDirectives {
    const userSnapshot = profile?.vocabularySnapshot ?? {};
    const projectVocab = projectContext.vocabularyModel;

    // Workspace vocabulary (E1-2 Phase C): highest authority for shared brand vocabulary.
    const workspaceVocab = extractWorkspaceVocabulary(workspaceLearnings);

    // Preferred terms: workspace > project > user.
    const userPreferred      = (userSnapshot['preferredTerms']    as Record<string, string> | undefined) ?? {};
    const projectPreferred   = (projectVocab['preferredTerms']    as Record<string, string> | undefined) ?? {};
    const workspacePreferred = workspaceVocab.preferredTerms;
    const preferredTerms     = { ...userPreferred, ...projectPreferred, ...workspacePreferred };

    // Forbidden terms: union of all levels (workspace + user + project — all apply).
    const userForbidden      = (userSnapshot['forbiddenTerms'] as string[] | undefined) ?? [];
    const projectForbidden   = (projectVocab['forbiddenTerms'] as string[] | undefined) ?? [];
    const workspaceForbidden = workspaceVocab.forbiddenTerms;
    const forbiddenTerms     = dedupe([...workspaceForbidden, ...userForbidden, ...projectForbidden]);

    // Domain jargon: from the user's expertise domains vocabulary.
    const domainJargon = (userSnapshot['domainJargon'] as string[] | undefined) ?? [];

    // Proprietary terms: extracted from knowledge assets.
    const proprietaryTerms = dedupe(
      projectContext.knowledgeAssets.flatMap(asset => {
        const vocab = asset.extractedVocabulary;
        if (!vocab) return [];
        return (vocab['proprietaryTerms'] as string[] | undefined) ?? [];
      }),
    );

    return {
      preferredTerms:  Object.keys(preferredTerms).length > 0 ? preferredTerms : DEFAULT_VOCABULARY_DIRECTIVES.preferredTerms,
      forbiddenTerms:  forbiddenTerms.length > 0 ? forbiddenTerms : DEFAULT_VOCABULARY_DIRECTIVES.forbiddenTerms,
      domainJargon:    domainJargon.length > 0   ? domainJargon   : DEFAULT_VOCABULARY_DIRECTIVES.domainJargon,
      proprietaryTerms,
    };
  }
}

// ── Workspace learning extraction helpers ──────────────────────────────────────
//
// These pull inferred style signals out of workspace-scoped Learning rows.
// Only 'brand_voice' domain learnings with voice-relevant content fields are
// used. Content shape is a convention, not a schema constraint — unrecognised
// fields are ignored; missing fields degrade to null/empty without error.

interface WorkspaceVoiceSignals {
  tone:           string[];
  sentenceRhythm: VoiceDirectives['sentenceRhythm'] | null;
  paragraphStyle: VoiceDirectives['paragraphStyle'] | null;
  avoidPatterns:  string[];
}

interface WorkspaceVocabSignals {
  preferredTerms: Record<string, string>;
  forbiddenTerms: string[];
}

const VALID_SENTENCE_RHYTHMS = new Set<string>(['short', 'mixed', 'long']);
const VALID_PARAGRAPH_STYLES = new Set<string>(['dense', 'airy']);

// Voice-relevant taxonomy categories. These are the categories whose Learning
// content may carry tone/rhythm/style/vocabulary signals applicable to blueprint
// voice resolution. All come from the workspace_intelligence domain.
const VOICE_TAXONOMY_CATEGORIES = new Set<string>([
  'communication_style',
  'writing_style',
  'domain_specific_vocabulary',
]);

function extractWorkspaceVoice(learnings: Learning[]): WorkspaceVoiceSignals {
  const voiceLearnings = learnings.filter(l => VOICE_TAXONOMY_CATEGORIES.has(l.taxonomyCategory));

  const tone: string[]           = [];
  let sentenceRhythm: VoiceDirectives['sentenceRhythm'] | null = null;
  let paragraphStyle: VoiceDirectives['paragraphStyle'] | null = null;
  const avoidPatterns: string[]  = [];

  for (const learning of voiceLearnings) {
    const c = learning.content;

    const t = c['tone'];
    if (Array.isArray(t)) tone.push(...(t as string[]));

    const sr = c['sentenceRhythm'];
    if (typeof sr === 'string' && VALID_SENTENCE_RHYTHMS.has(sr) && sentenceRhythm === null) {
      sentenceRhythm = sr as VoiceDirectives['sentenceRhythm'];
    }

    const ps = c['paragraphStyle'];
    if (typeof ps === 'string' && VALID_PARAGRAPH_STYLES.has(ps) && paragraphStyle === null) {
      paragraphStyle = ps as VoiceDirectives['paragraphStyle'];
    }

    const ap = c['avoidPatterns'];
    if (Array.isArray(ap)) avoidPatterns.push(...(ap as string[]));
  }

  return {
    tone:           dedupe(tone),
    sentenceRhythm,
    paragraphStyle,
    avoidPatterns:  dedupe(avoidPatterns),
  };
}

function extractWorkspaceVocabulary(learnings: Learning[]): WorkspaceVocabSignals {
  const vocabLearnings = learnings.filter(l => VOICE_TAXONOMY_CATEGORIES.has(l.taxonomyCategory));

  const preferredTerms: Record<string, string> = {};
  const forbiddenTerms: string[]               = [];

  for (const learning of vocabLearnings) {
    const c = learning.content;

    const pt = c['preferredTerms'];
    if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
      Object.assign(preferredTerms, pt as Record<string, string>);
    }

    const ft = c['forbiddenTerms'];
    if (Array.isArray(ft)) forbiddenTerms.push(...(ft as string[]));
  }

  return {
    preferredTerms,
    forbiddenTerms: dedupe(forbiddenTerms),
  };
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
