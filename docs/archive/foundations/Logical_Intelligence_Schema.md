# BrandOS Logical Intelligence Schema

> **Historical specification document.** The original logical entity schema (24 entities) that the implementation is based on. 16 of those entities are implemented in `src/types/entities.ts`; the remaining 8 are deferred stubs with documented activation triggers (see `INTELLIGENCEOS_BOOTSTRAP.md` §5). The Postgres schema has since been superseded by `src/db/schema.sql` as the single source of truth — use the SQL file, not the logical schema tables here, for current column names and constraints.

**Document Class:** Architectural Bridge Document  
**Status:** Derived from Approved Architecture  
**Authority Documents:** BrandOS Learning Taxonomy v1.0 · BrandOS Intelligence Architecture v1.0  
**Scope:** Logical intelligence model required to implement the approved architecture  
**Covers:** Entity model · Relationships · Lifecycle · State machine · Domain ownership · Conflict model · Phased roadmap

---

> **Architectural Axiom:** The Taxonomy defines *what* BrandOS learns.  
> The Architecture defines *how* intelligence is organized and consumed.  
> This Schema defines *the logical entities, relationships, lifecycle, and interaction model*  
> required to make both documents implementable.

---

## Table of Contents

- [Section A — Core Intelligence Entity Model](#section-a--core-intelligence-entity-model)
- [Section B — Entity Definitions](#section-b--entity-definitions)
- [Section C — Entity Relationship Architecture](#section-c--entity-relationship-architecture)
- [Section D — Signal → Intelligence Pipeline](#section-d--signal--intelligence-pipeline)
- [Section E — Intelligence State Machine](#section-e--intelligence-state-machine)
- [Section F — Domain Ownership Model](#section-f--domain-ownership-model)
- [Section G — Project Intelligence Schema](#section-g--project-intelligence-schema)
- [Section H — Artifact Intelligence Schema](#section-h--artifact-intelligence-schema)
- [Section I — Knowledge Intelligence: Architectural Ruling](#section-i--knowledge-intelligence-architectural-ruling)
- [Section J — Intelligence Conflict Model](#section-j--intelligence-conflict-model)
- [Section K — Minimum Implementable Model](#section-k--minimum-implementable-model)
- [Section L — Intelligence Contract Preparation](#section-l--intelligence-contract-preparation)
- [Final Deliverable Summary](#final-deliverable-summary)

---

# Section A — Core Intelligence Entity Model

## A.1 — Derivation Method

First-class intelligence entities are derived by asking: *What must exist as a distinct, persistable, governable logical object for BrandOS to generate compounding artifact quality?* An entity earns first-class status when it satisfies all four conditions:

1. It has a distinct purpose not reducible to another entity
2. It has its own lifecycle independent from other entities
3. It generates or consumes intelligence that no other entity can fully represent
4. Its absence would measurably degrade artifact quality

Candidate entities that fail any condition are demoted to attributes of another entity.

---

## A.2 — Complete First-Class Entity List

| # | Entity | Domain Ownership | Why It Exists | Lifecycle | Artifact Quality Impact |
|---|--------|-----------------|--------------|-----------|------------------------|
| 1 | **User** | User Intelligence | The irreducible subject of all intelligence. Every other entity exists in relation to a User. | Permanent (for BrandOS lifetime) | Critical — wrong User model degrades everything |
| 2 | **Intelligence Profile** | User Intelligence | The consolidated, versioned model of a User at a point in time. The operationalized form of everything BrandOS has learned. | Evolves continuously; versioned on significant change | Critical — this is what generation consults |
| 3 | **Archetype** | User Intelligence | A structured hypothesis about who the User is professionally. Shapes default calibrations across all artifact types. | Evolves; supports multiple simultaneous archetypes at weighted confidence | Very High |
| 4 | **Workspace** | Workspace Intelligence | The organizational context within which one or more Users operate. Owns shared standards, vocabulary, and assets. | Stable; evolves slowly on administrative action | High (at team/enterprise scale) |
| 5 | **Project** | Project Intelligence | A bounded, purposeful initiative that produces a coherent stream of related artifacts. | Bounded (creation → active → wind-down → archived) | Very High — transforms generic to contextual |
| 6 | **Artifact** | Artifact Intelligence | A discrete generated output. The unit of value that BrandOS produces. Source of all feedback signals. | Created → delivered → evaluated → signals extracted | Critical — the system's primary output |
| 7 | **Artifact Blueprint** | Artifact Intelligence | The structural specification for an Artifact before generation. Combines pattern model with context-specific customization. | Ephemeral — created per generation event; accepted versions become Exemplars | Very High |
| 8 | **Artifact Pattern** | Artifact Intelligence | A learned, validated structural model for a specific artifact type. Accumulates from accepted artifacts over time. | Long-term; reinforced by acceptance; updated by editing patterns | Very High |
| 9 | **Artifact Exemplar** | Artifact Intelligence | A specific accepted artifact that serves as a positive structural reference. | Permanent reference; may be superseded but not deleted | High |
| 10 | **Relationship** | Relationship Intelligence | A modeled representation of a specific person or organization in the User's professional world. | Medium-term; decays without contact; archived on relationship end | High (external artifact quality) |
| 11 | **Audience Profile** | Relationship Intelligence / User Intelligence | A calibration model for a class of recipients. May be generic (User-level) or specific (named Relationship). | Medium-term; enriched with each artifact directed at this audience | High |
| 12 | **Goal** | User Intelligence / Project Intelligence | A desired outcome the User or Project is pursuing. Governs artifact relevance. | Medium-term; re-confirmed every 90 days or on context shift | Very High |
| 13 | **Constraint** | User Intelligence / Project Intelligence | A limit on what the User or Project can or will do. Prevents out-of-bounds generation. | Medium-term; re-validated on context change | High |
| 14 | **Preference** | User Intelligence / Artifact Intelligence | A learned disposition toward a particular format, structure, depth, tone, or style. | Long-term; updated by consistent feedback signals | High |
| 15 | **Framework** | User Intelligence | An intellectual model or methodology the User applies to reasoning and problem-solving. | Long-term; added when confirmed; rarely removed | High |
| 16 | **Knowledge Asset** | Knowledge Intelligence (see Section I) | Proprietary intellectual property the User possesses — frameworks, playbooks, methodologies, models. | Permanent (explicitly uploaded); updated on new version upload | Critical — highest authenticity signal |
| 17 | **Signal** | All Domains | A raw, unvalidated observation extracted from a User interaction, artifact, or upload. The atomic input to the learning pipeline. | Ephemeral — processed into Hypothesis or discarded | Indirect — foundational to learning |
| 18 | **Observation** | All Domains | A structured Signal with source metadata attached. More specific than raw Signal; still unvalidated. | Short-term — consumed by Hypothesis formation | Indirect |
| 19 | **Hypothesis** | All Domains | A structured proposition about a User, Project, Artifact, or Relationship derived from one or more Observations. Requires validation before becoming a Learning. | Provisional — upgraded or discarded within defined confirmation window | Indirect — quality gate |
| 20 | **Learning** | All Domains | A validated, confidence-scored intelligence update that has been confirmed across sufficient corroborating signals. The atomic unit of persistent intelligence. | Persistent — evolves through state machine (Section E) | High — direct input to Intelligence Profile |
| 21 | **Conflict** | Cross-Domain | A formally represented disagreement between two or more intelligence signals, domains, or requirements. | Ephemeral per generation event; recurring conflicts escalate to persistent Conflict Record | Medium — prevents silent intelligence failures |
| 22 | **Feedback Event** | All Domains | A recorded User response to a generated artifact — acceptance, editing, rejection, or explicit feedback. The primary source of validation signals. | Ephemeral — processed into Signals immediately | Critical — primary learning trigger |
| 23 | **Vocabulary Model** | User Intelligence / Workspace Intelligence / Project Intelligence | The domain-specific, idiosyncratic, and organizational terminology the User employs and expects. | Long-term; accumulates continuously | Very High — authenticity signal |
| 24 | **Operating Principle** | User Intelligence | A non-negotiable value or behavioral rule the User applies consistently across contexts. | Near-permanent — changed only by explicit User declaration or strong contradictory evidence | High — prevents value misalignment |

---

## A.3 — Excluded Candidates and Justification

| Candidate | Decision | Reason |
|-----------|----------|--------|
| Session | **Not first-class** | A session is a temporal container, not an intelligence entity. Its outputs (Signals, Feedback Events) are first-class; the session itself is not. |
| Prompt | **Not first-class** | A prompt is an input event, not a persistent intelligence entity. Prompt patterns may inform Preferences but are not themselves stored. |
| Memory | **Not first-class** | BrandOS does not store memories — it stores validated intelligence. Memory is an implementation concept, not a logical entity. |
| Tag / Label | **Not first-class** | Tags are metadata attributes on other entities, not independent entities. |
| Template | **Absorbed into Artifact Pattern** | A Template is the pre-validation form of an Artifact Pattern. Once a pattern is confirmed, Template as a concept is subsumed. |
| Competitive Intelligence | **Attribute of Project, not entity** | Competitive signals belong to Project context or User-level Domain Knowledge. They are enrichment attributes, not standalone entities. |

---

# Section B — Entity Definitions

## B.1 — User

| Attribute | Definition |
|-----------|-----------|
| **Description** | The individual human who interacts with BrandOS. The root entity from which all other intelligence derives its meaning. |
| **Required Attributes** | `user_id` (unique, immutable), `created_at`, `primary_archetype_id`, `intelligence_profile_id`, `workspace_id` (optional) |
| **Optional Attributes** | `display_name`, `timezone`, `language_preference`, `onboarding_completed_at`, `secondary_archetype_ids[]` |
| **Validation Rules** | A User must have at least one associated Intelligence Profile before artifact generation is permitted. Primary Archetype must be at ≥ Low confidence before generation uses it for calibration. |
| **Confidence Model** | Not applicable — User entity itself is not confidence-scored. Child entities (Archetype, Learnings) carry confidence. |

---

## B.2 — Intelligence Profile

| Attribute | Definition |
|-----------|-----------|
| **Description** | The consolidated, versioned, operationalized representation of everything BrandOS has learned about a User. This is the entity consulted during artifact generation — not the raw Learning store. |
| **Required Attributes** | `profile_id`, `user_id`, `version`, `created_at`, `last_updated_at`, `overall_confidence_score`, `voice_model_ref`, `goal_model_ref`, `expertise_model_ref`, `constraint_model_ref` |
| **Optional Attributes** | `archetype_distribution`, `framework_refs[]`, `vocabulary_model_ref`, `operating_principle_refs[]`, `emotional_register_model_ref`, `behavioral_pattern_model_ref` |
| **Validation Rules** | Profile must be rebuilt (versioned) when more than three high-confidence Learnings are added or when a permanent category (identity, operating principles) changes. A Profile that has not been validated against new Learnings in > 60 days must be flagged for refresh. |
| **Confidence Model** | Composite score aggregated from constituent Learning confidence scores, weighted by the Taxonomy's impact priority hierarchy. Overall score degrades as constituent Learnings decay. |

---

## B.3 — Archetype

| Attribute | Definition |
|-----------|-----------|
| **Description** | A structured, confidence-scored hypothesis about the User's professional identity category. Shapes default calibrations for all artifact types until higher-confidence signals override. |
| **Required Attributes** | `archetype_id`, `user_id`, `archetype_type` (enum: Founder, CEO, Product Leader, Engineering Leader, Architect, Consultant, Researcher, Professor, Student, Job Seeker, Writer/Creator, Investor, Coach/Advisor, Freelancer, Agency Operator, Enterprise Team Member, Multi-archetype), `confidence_score`, `evidence_count`, `first_observed_at`, `last_confirmed_at` |
| **Optional Attributes** | `weight` (for multi-archetype distributions), `primary_signals[]`, `archetype_notes`, `superseded_by_archetype_id` |
| **Validation Rules** | A single signal never elevates Archetype confidence above Low. High confidence requires ≥ 10 consistent signals from ≥ 3 distinct signal types. Explicit self-identification grants Medium (provisional) confidence until behaviorally confirmed. Users may hold multiple Archetypes simultaneously; weights must sum to 1.0. |
| **Confidence Model** | Low (1 signal) → Medium-Provisional (explicit self-identification) → Medium (3–9 consistent signals, 2+ signal types) → High (≥ 10 signals, ≥ 3 signal types, ≥ 2 distinct artifact types uploaded) → Confirmed (High + behavioral corroboration across ≥ 2 sessions) |

---

## B.4 — Goal

| Attribute | Definition |
|-----------|-----------|
| **Description** | A desired outcome the User or Project is actively pursuing. The relevance anchor for artifact generation. An artifact that does not serve at least one active Goal scores zero for relevance regardless of quality. |
| **Required Attributes** | `goal_id`, `owner_type` (User / Project), `owner_id`, `goal_description`, `time_horizon` (immediate / quarter / annual / long-term), `confidence_score`, `stated_or_inferred` (enum), `created_at`, `last_revalidated_at`, `expires_at` |
| **Optional Attributes** | `success_metrics[]`, `associated_project_id`, `priority_rank`, `dependencies[]`, `related_constraint_ids[]` |
| **Validation Rules** | Goals must be re-confirmed at the interval specified by `time_horizon`. Immediate goals expire after 30 days without confirmation. Annual goals require re-confirmation at 90 days and 180 days. Goals stated explicitly carry Medium confidence until corroborated; inferred Goals carry Low confidence until explicitly confirmed. |
| **Confidence Model** | Low (inferred from single context) → Medium (explicitly stated) → High (stated + corroborated by artifact requests) → Confirmed (High + success metrics defined + multiple artifacts generated in service of goal) |

---

## B.5 — Constraint

| Attribute | Definition |
|-----------|-----------|
| **Description** | A defined limit on what the User or Project can do, will do, or is prohibited from doing. Prevents generation of inapplicable recommendations or out-of-bounds artifacts. |
| **Required Attributes** | `constraint_id`, `owner_type` (User / Project / Workspace), `owner_id`, `constraint_type` (enum: budget / regulatory / technology / team / time / ethical / contractual / organizational), `constraint_description`, `confidence_score`, `hard_or_soft` (enum), `stated_or_inferred`, `created_at`, `valid_until` |
| **Optional Attributes** | `applies_to_artifact_types[]`, `applies_to_context`, `exception_conditions`, `override_authority` |
| **Validation Rules** | Hard constraints must never be violated by generation. Soft constraints may be departed from when a higher-precedence conflict resolution rule applies (see Section J), but departure must be surfaced explicitly. Workspace-level compliance constraints are always Hard. |
| **Confidence Model** | Low (inferred) → Medium (stated once) → High (stated + corroborated or demonstrated through accepted artifacts) → Confirmed (explicitly stated as non-negotiable by User) |

---

## B.6 — Preference

| Attribute | Definition |
|-----------|-----------|
| **Description** | A learned disposition toward a particular format, structure, depth, tone, length, vocabulary style, or narrative approach. Preferences are the most granular calibration layer in artifact generation. |
| **Required Attributes** | `preference_id`, `user_id`, `preference_domain` (enum: format / structure / depth / length / tone / vocabulary / narrative / visual / citation), `preference_type` (specific description), `artifact_type_scope` (global / specific artifact type), `context_scope` (global / internal / external / project-specific), `confidence_score`, `observation_count`, `first_observed_at`, `last_confirmed_at` |
| **Optional Attributes** | `project_scope_id`, `audience_scope_id`, `counter_evidence_count`, `last_contradicted_at` |
| **Validation Rules** | A Preference that has been contradicted ≥ 2 times without a corresponding confirmation must be demoted in confidence or split into context-specific sub-preferences. Single-session instructions never create Preferences. A Preference observed only in role-play or hypothetical context must be discarded. |
| **Confidence Model** | Session-scoped (single instruction) → Provisional (1 non-role-play observation) → Low (2 observations) → Medium (3–5 consistent observations, 0 contradictions) → High (6+ consistent observations, ≤1 contradiction) → Confirmed (High + explicit User affirmation) |

---

## B.7 — Framework

| Attribute | Definition |
|-----------|-----------|
| **Description** | An intellectual model, mental model, or methodology the User consistently applies to their professional reasoning. Shapes how BrandOS structures strategic and analytical artifacts. |
| **Required Attributes** | `framework_id`, `user_id`, `framework_name`, `framework_category` (enum: analytical / strategic / creative / technical / methodological / evaluative), `description`, `confidence_score`, `observation_count`, `first_observed_at` |
| **Optional Attributes** | `source` (uploaded / inferred / stated), `applies_to_artifact_types[]`, `applies_to_contexts[]`, `framework_vocabulary[]`, `proprietary_flag` (boolean — is this the User's own IP?) |
| **Validation Rules** | A Framework extracted from a single artifact carries Provisional confidence only. Frameworks that appear consistently across three or more distinct artifacts or conversations are escalated to Medium. A Framework flagged as `proprietary_flag: true` is also registered as a Knowledge Asset. |
| **Confidence Model** | Provisional (single observation) → Low (2 observations) → Medium (3+ observations, ≥2 distinct contexts) → High (5+ observations + explicit User reference to framework by name) |

---

## B.8 — Knowledge Asset

| Attribute | Definition |
|-----------|-----------|
| **Description** | Proprietary intellectual property the User or Workspace possesses: frameworks, methodologies, playbooks, models, institutional knowledge. The richest single intelligence signal in the system — enables artifact generation that extends rather than imitates the User's own IP. |
| **Required Attributes** | `asset_id`, `owner_type` (User / Workspace), `owner_id`, `asset_type` (enum: framework / methodology / playbook / model / template / case_study / IP), `asset_name`, `asset_description`, `acquired_at`, `source_type` (explicit_upload / inferred / stated), `confidence_score` |
| **Optional Attributes** | `version`, `last_updated_at`, `related_artifact_ids[]`, `vocabulary_extracted[]`, `patterns_extracted[]`, `framework_ids[]` (linked Frameworks derived from this asset), `access_scope` (user_only / project / workspace) |
| **Validation Rules** | Knowledge Assets acquired via explicit upload carry Very High confidence immediately upon upload. Assets inferred from conversation carry Low confidence until upload confirmation. Knowledge Assets must never be shared across users without explicit workspace sharing authorization. Vocabulary and patterns extracted from Knowledge Assets are always tagged with the Asset as their source. |
| **Confidence Model** | Low (inferred from description) → Medium (stated and described by User) → High (uploaded artifact, unverified) → Very High (uploaded artifact + User confirmation) → Confirmed (Very High + used successfully in accepted artifacts) |

---

## B.9 — Signal

| Attribute | Definition |
|-----------|-----------|
| **Description** | A raw, unvalidated observation extracted from a User interaction, artifact, upload, or Feedback Event. The atomic input to the learning pipeline. Signals are never persisted as intelligence — they are processed and either become Observations or are discarded. |
| **Required Attributes** | `signal_id`, `source_type` (enum: prompt / upload / feedback / edit / explicit_statement / behavioral), `source_ref`, `raw_content`, `extracted_at`, `signal_category` (maps to Taxonomy categories), `session_id` |
| **Optional Attributes** | `context_flags[]` (role_play / hypothetical / client_context / emotional_state), `confidence_modifier` |
| **Validation Rules** | Signals with `context_flags` containing `role_play`, `hypothetical`, or `emotional_state` must be quarantined and not processed into Observations unless the User is explicitly describing their own persistent identity or preference. Signals from a single session that are task-specific (e.g., "make this shorter") must not be escalated beyond session scope. |
| **Confidence Model** | Not independently scored — context_flags determine whether the Signal enters the pipeline at all. |

---

## B.10 — Observation

| Attribute | Definition |
|-----------|-----------|
| **Description** | A structured Signal with metadata attached: what was observed, in what context, from what source, and with what initial confidence estimate. The first step toward a Learning. |
| **Required Attributes** | `observation_id`, `signal_id`, `taxonomy_category`, `observed_entity_type`, `observed_entity_id` (if applicable), `observation_statement`, `context` (artifact_type / project_id / audience_id / scope), `source_quality` (enum: explicit_statement / demonstrated_behavior / uploaded_artifact / inferred), `initial_confidence_estimate`, `observed_at` |
| **Optional Attributes** | `corroborating_observation_ids[]`, `contradicting_observation_ids[]` |
| **Validation Rules** | An Observation formed from a signal with `source_quality: inferred` must start at confidence ≤ Low. An Observation from `uploaded_artifact` starts at ≥ Medium. An Observation from `explicit_statement` starts at Medium-Provisional. |
| **Confidence Model** | Inherited from Signal quality: Inferred → Low; Stated → Medium-Provisional; Demonstrated → Medium; Uploaded → Medium-High; Explicit + Behavioral → High |

---

## B.11 — Hypothesis

| Attribute | Definition |
|-----------|-----------|
| **Description** | A structured proposition derived from one or more Observations. The provisional form of a Learning. Must survive validation before it becomes persistent intelligence. A wrong Hypothesis that is escalated to a Learning is a model liability. |
| **Required Attributes** | `hypothesis_id`, `target_entity_type`, `target_entity_id`, `proposition`, `supporting_observation_ids[]`, `taxonomy_category`, `formed_at`, `confidence_score`, `validation_state` (enum: pending / accumulating / challenged / confirmed / rejected), `required_corroborations` (minimum count before promotion), `current_corroborations` |
| **Optional Attributes** | `contradicting_observation_ids[]`, `competing_hypothesis_ids[]`, `expires_at` (Hypotheses without corroboration within window are discarded), `escalation_reason` |
| **Validation Rules** | A Hypothesis formed from a single Observation must have `required_corroborations ≥ 2` before promotion. A Hypothesis that accumulates ≥ 1 contradicting Observation of equal or higher source quality must have its confidence halved and re-enter `accumulating` state. A Hypothesis that does not receive corroboration within 30 days must be discarded unless it is in the `permanent` taxonomy category. |
| **Confidence Model** | Formed (confidence inherits from anchor Observation) → Accumulating (confidence grows with each corroboration) → Challenged (confidence decreases on contradiction) → Confirmed (minimum corroborations met, no unresolved contradictions) → Rejected (contradictions outweigh corroborations) |

---

## B.12 — Learning

| Attribute | Definition |
|-----------|-----------|
| **Description** | A validated, confidence-scored intelligence update that has been confirmed across sufficient corroborating signals. The atomic unit of persistent intelligence that flows into the Intelligence Profile. Learnings are what BrandOS actually knows — not what it has observed, not what it suspects. |
| **Required Attributes** | `learning_id`, `source_hypothesis_id`, `target_entity_type`, `target_entity_id`, `taxonomy_category`, `learning_statement`, `confidence_score`, `stability_class` (enum: permanent / long_term / medium_term / decaying), `acquisition_date`, `last_validated_at`, `state` (see state machine, Section E), `corroboration_count`, `contradiction_count` |
| **Optional Attributes** | `context_scope` (global / artifact_type / project / audience), `decay_rate`, `revalidation_due_at`, `superseded_by_learning_id`, `source_learning_ids[]` (for compound learnings), `correction_source` (user_explicit / behavioral / upload) |
| **Validation Rules** | A Learning in `permanent` stability class cannot transition to `decaying` or `archived` without explicit User action or strong contradictory evidence (confidence ≥ High from 2+ independent sources). Learnings extracted only from role-play, hypothetical, or emotional-state contexts are permanently ineligible. A Learning's `context_scope` must be applied in generation — a preference for brevity in executive summaries must not be applied to research papers. |
| **Confidence Model** | Validated (promoted from Hypothesis: confidence carries over) → Confirmed (additional post-promotion corroborations) → Decaying (time-based or context-shift) → Archived (superseded or expired) |

---

## B.13 — Relationship

| Attribute | Definition |
|-----------|-----------|
| **Description** | A modeled representation of a specific person or organization in the User's professional world. Enables precise calibration of artifacts directed at named recipients. |
| **Required Attributes** | `relationship_id`, `user_id`, `relationship_name`, `relationship_type` (enum: investor / board_member / client / employee / partner / recruiter / regulator / colleague / customer / media), `expertise_level` (enum: novice / practitioner / expert / domain_expert), `communication_preference_model_ref`, `confidence_score`, `first_mentioned_at`, `last_artifact_sent_at` |
| **Optional Attributes** | `organization`, `role`, `known_priorities[]`, `known_sensitivities[]`, `prior_interaction_summary`, `project_associations[]`, `audience_profile_id`, `decay_flag` (boolean), `relationship_notes` |
| **Validation Rules** | A Relationship profile with only one supporting signal carries Low confidence and must not override User preferences in generation. Named Relationships that have not appeared in context for > 90 days receive a decay flag and their confidence degrades. A Relationship that ends or fundamentally changes (e.g., a client becomes a former client) must be archived and a new profile created if the relationship continues in a new form. |
| **Confidence Model** | Provisional (first mention) → Low (second mention, no artifact directed at them) → Medium (second mention + at least one artifact directed at them) → High (multiple artifacts + User-provided profile information) → Confirmed (High + positive artifact outcomes specifically attributed to calibration) |

---

## B.14 — Audience Profile

| Attribute | Definition |
|-----------|-----------|
| **Description** | A calibration model for a class of recipients. Exists at two levels: (1) generic, User-level profiles for recurring audience types (e.g., "technical engineering teams"); (2) specific, named Relationship-linked profiles for individual stakeholders. |
| **Required Attributes** | `profile_id`, `owner_type` (User / Project / Relationship), `owner_id`, `profile_name`, `expertise_level`, `communication_norms`, `expected_depth`, `vocabulary_register` (enum: technical / executive / general / academic), `confidence_score`, `created_at`, `last_enriched_at` |
| **Optional Attributes** | `decision_making_context`, `known_concerns[]`, `preferred_format`, `cultural_context`, `language_preference`, `relationship_id` (if Relationship-linked), `artifact_type_calibrations[]` |
| **Validation Rules** | Generic Audience Profiles (not linked to a specific Relationship) should be used when no Relationship-specific profile exists. When both exist, the specific Relationship profile always takes precedence for that named recipient. |
| **Confidence Model** | Low (inferred from general knowledge) → Medium (User-described) → High (User-described + artifact feedback corroboration) → Confirmed (High + multiple successful artifact calibrations) |

---

## B.15 — Artifact Pattern

| Attribute | Definition |
|-----------|-----------|
| **Description** | A learned, validated structural model for a specific artifact type at a specific context level (universal / archetype / user-calibrated). Accumulates from accepted artifacts and editing signals over time. The primary intelligence consulted for structure selection during generation. |
| **Required Attributes** | `pattern_id`, `artifact_type`, `pattern_level` (enum: universal / archetype / user_calibrated), `user_id` (null for universal patterns), `archetype_type` (null for universal / user patterns), `section_structure[]`, `default_depth`, `default_length_range`, `narrative_frame`, `confidence_score`, `exemplar_count`, `rejection_count`, `created_at`, `last_reinforced_at` |
| **Optional Attributes** | `opening_pattern`, `closing_pattern`, `section_depth_calibrations[]`, `known_rejection_triggers[]`, `active_flag` |
| **Validation Rules** | A universal pattern may be used as baseline from Day 1. A user-calibrated pattern requires ≥ 2 accepted exemplars before it overrides the universal/archetype baseline. A pattern with rejection_count ≥ 2 must trigger a drift-detection review. If a user's editing patterns consistently modify a section in the same way, that modification must be incorporated into the user-calibrated pattern. |
| **Confidence Model** | Baseline (pre-built universal) → Provisional-Calibrated (1 accepted exemplar) → Calibrated (2+ accepted exemplars, 0 rejections) → High-Calibrated (5+ exemplars, editing patterns stable) → Confirmed (10+ exemplars, consistently accepted without structural edits) |

---

## B.16 — Conflict

| Attribute | Definition |
|-----------|-----------|
| **Description** | A formally represented disagreement between two or more intelligence signals, domain requirements, or entity attributes that cannot be simultaneously satisfied in artifact generation. Conflicts must be detected before generation, resolved by the Conflict Resolution Model (Section J), and recorded. |
| **Required Attributes** | `conflict_id`, `conflict_type` (enum: domain_authority / preference_vs_requirement / style_vs_audience / constraint_vs_goal / vocabulary_scope / compliance_vs_preference), `entity_a_ref`, `entity_b_ref`, `resolution_rule_applied` (see Section J), `resolution_outcome`, `detected_at`, `resolved_at`, `artifact_id` (the generation context) |
| **Optional Attributes** | `user_notified` (boolean), `user_override` (boolean), `override_instruction`, `recurring_flag` (boolean — has this conflict appeared ≥ 3 times?), `escalated_to_user` (boolean) |
| **Validation Rules** | Recurring Conflicts (≥ 3 appearances) must generate a persistent Conflict Record that is surfaced to the User for resolution rather than being silently resolved each time. User overrides are the highest authority and must be honored immediately. Workspace compliance Conflicts are never surfaceable for User override. |
| **Confidence Model** | Not confidence-scored — Conflicts are binary (exists / resolved). Recurrence frequency is tracked separately. |

---

## B.17 — Feedback Event

| Attribute | Definition |
|-----------|-----------|
| **Description** | A recorded User response to a generated artifact. The primary learning trigger in BrandOS. Every Feedback Event produces Signals that enter the pipeline. Feedback Events are the compounding engine — without them, intelligence does not grow. |
| **Required Attributes** | `event_id`, `artifact_id`, `user_id`, `event_type` (enum: accepted / accepted_with_edits / rejected / explicitly_praised / explicitly_criticized / deployed / abandoned), `recorded_at`, `session_id` |
| **Optional Attributes** | `edit_diff_ref` (reference to structural/content diff if edited), `explicit_feedback_text`, `domains_implicated[]` (which intelligence domains the feedback touches), `signals_generated[]` |
| **Validation Rules** | An `accepted` event with no edits carries higher positive signal weight than `accepted_with_edits`. A `rejected` event that is not followed by a corrective instruction should generate only a negative signal, not an immediate model update. Negative feedback on two consecutive artifacts for the same dimension triggers a model review event, not just a signal. |
| **Confidence Model** | Not independently scored — produces Signals with varying confidence weights based on feedback type. |

---

# Section C — Entity Relationship Architecture

## C.1 — Primary Relationship Map

```
USER
│
├──[owns 1:1]──► INTELLIGENCE PROFILE
│                      │
│                      ├──[contains N:N]──► LEARNING
│                      ├──[references 1:N]──► FRAMEWORK
│                      ├──[references 1:N]──► OPERATING PRINCIPLE
│                      └──[references 1:N]──► VOCABULARY MODEL
│
├──[has 1:N]──► ARCHETYPE (weighted, multiple)
│
├──[creates 1:N]──► PROJECT
│                      │
│                      ├──[owns 1:N]──► GOAL (project-scoped)
│                      ├──[owns 1:N]──► CONSTRAINT (project-scoped)
│                      ├──[contains 1:N]──► ARTIFACT
│                      ├──[maintains 1:N]──► KNOWLEDGE ASSET (project-scoped)
│                      └──[references 1:N]──► RELATIONSHIP
│
├──[generates 1:N]──► ARTIFACT (not in project context)
│
├──[owns 1:N]──► GOAL (user-scoped)
├──[owns 1:N]──► CONSTRAINT (user-scoped)
├──[owns 1:N]──► PREFERENCE (user-scoped)
├──[owns 1:N]──► KNOWLEDGE ASSET (user-scoped)
├──[maintains 1:N]──► RELATIONSHIP
└──[belongs to 0:1]──► WORKSPACE

ARTIFACT
│
├──[generated from 1:1]──► ARTIFACT BLUEPRINT
│                              │
│                              ├──[built from 1:N]──► ARTIFACT PATTERN
│                              ├──[references 0:N]──► ARTIFACT EXEMPLAR
│                              ├──[applies 0:N]──► PREFERENCE
│                              └──[resolves 0:N]──► CONFLICT
│
├──[produces 1:N]──► FEEDBACK EVENT
│                        │
│                        └──[generates 1:N]──► SIGNAL
│                                                 │
│                                                 └──[becomes 0:1]──► OBSERVATION
│                                                                          │
│                                                                          └──[accumulates into 0:1]──► HYPOTHESIS
│                                                                                                           │
│                                                                                                           └──[promotes to 0:1]──► LEARNING
│                                                                                                                                       │
│                                                                                                                                       └──[enriches]──► INTELLIGENCE PROFILE
│
└──[may become]──► ARTIFACT EXEMPLAR

RELATIONSHIP
└──[generates 1:1]──► AUDIENCE PROFILE

WORKSPACE
├──[contains 1:N]──► USER
├──[owns 1:N]──► KNOWLEDGE ASSET (workspace-scoped)
├──[owns 1:N]──► VOCABULARY MODEL (workspace-scoped)
└──[defines 1:N]──► CONSTRAINT (workspace / compliance)
```

---

## C.2 — Complete Relationship Table

| Entity A | Relationship | Entity B | Cardinality | Directionality | Ownership |
|----------|-------------|----------|-------------|----------------|-----------|
| User | owns | Intelligence Profile | 1:1 | User → Profile | User |
| User | has | Archetype | 1:N (weighted) | User → Archetype | User |
| User | creates | Project | 1:N | User → Project | User |
| User | generates | Artifact | 1:N | User → Artifact | User / Project |
| User | owns | Goal (user) | 1:N | User → Goal | User |
| User | owns | Constraint (user) | 1:N | User → Constraint | User |
| User | has | Preference | 1:N | User → Preference | User |
| User | owns | Knowledge Asset (user) | 1:N | User → KA | User |
| User | maintains | Relationship | 1:N | User → Relationship | User |
| User | belongs to | Workspace | N:1 | User → Workspace | Workspace |
| Intelligence Profile | contains | Learning | 1:N | Profile → Learning | Learning |
| Intelligence Profile | references | Framework | 1:N | Profile → Framework | User |
| Intelligence Profile | references | Vocabulary Model | 1:1 | Profile → Vocab | User |
| Archetype | informs | Intelligence Profile | N:1 | Archetype → Profile | User |
| Project | owns | Goal (project) | 1:N | Project → Goal | Project |
| Project | owns | Constraint (project) | 1:N | Project → Constraint | Project |
| Project | contains | Artifact | 1:N | Project → Artifact | Project |
| Project | owns | Knowledge Asset (project) | 1:N | Project → KA | Project |
| Project | references | Relationship | N:N | Project → Relationship | User |
| Artifact | generated from | Artifact Blueprint | 1:1 | Artifact → Blueprint | Artifact Intelligence |
| Artifact | produces | Feedback Event | 1:N | Artifact → FE | System |
| Artifact | may become | Artifact Exemplar | 0:1 | Artifact → Exemplar | Artifact Intelligence |
| Artifact Blueprint | built from | Artifact Pattern | N:1 | Blueprint → Pattern | Artifact Intelligence |
| Artifact Blueprint | references | Artifact Exemplar | N:N | Blueprint → Exemplar | Artifact Intelligence |
| Artifact Blueprint | applies | Preference | N:N | Blueprint → Preference | User |
| Artifact Blueprint | resolves | Conflict | N:N | Blueprint → Conflict | Conflict Model |
| Artifact Exemplar | reinforces | Artifact Pattern | N:1 | Exemplar → Pattern | Artifact Intelligence |
| Feedback Event | generates | Signal | 1:N | FE → Signal | System |
| Signal | becomes | Observation | 1:0:1 | Signal → Observation | Learning Pipeline |
| Observation | accumulates into | Hypothesis | N:1 | Observation → Hypothesis | Learning Pipeline |
| Hypothesis | promotes to | Learning | 1:0:1 | Hypothesis → Learning | Learning Pipeline |
| Learning | enriches | Intelligence Profile | N:1 | Learning → Profile | User / Domain |
| Relationship | generates | Audience Profile | 1:1 | Relationship → Profile | Relationship Intelligence |
| Workspace | contains | User | 1:N | Workspace → User | Workspace |
| Workspace | owns | Knowledge Asset | 1:N | Workspace → KA | Workspace |
| Workspace | defines | Constraint (compliance) | 1:N | Workspace → Constraint | Workspace |

---

# Section D — Signal → Intelligence Pipeline

## D.1 — Complete Pipeline Definition

The Signal → Intelligence Pipeline is the compounding engine of BrandOS. Every interaction that produces a Signal has the potential to improve future artifact quality. The pipeline has six distinct stages, each with a defined gate and confidence handling model.

```
INPUT EVENT
(Prompt / Upload / Feedback / Edit / Explicit Statement / Behavioral)
        │
        ▼
┌───────────────────────────────────┐
│  STAGE 1: SIGNAL EXTRACTION       │
│                                   │
│  • Extract raw observations from  │
│    the input event                │
│  • Tag with source_type and       │
│    context_flags                  │
│  • GATE: Quarantine signals with  │
│    role_play / hypothetical /     │
│    emotional_state flags          │
│  • Discard quarantined signals    │
│    unless they describe persistent│
│    identity (explicit override)   │
└──────────────┬────────────────────┘
               │ Validated signals only
               ▼
┌───────────────────────────────────┐
│  STAGE 2: OBSERVATION FORMATION   │
│                                   │
│  • Attach metadata: taxonomy      │
│    category, context, source      │
│    quality, initial confidence    │
│  • GATE: Source quality sets      │
│    confidence ceiling:            │
│    Inferred → Low ceiling         │
│    Stated → Medium ceiling        │
│    Uploaded → High ceiling        │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│  STAGE 3: HYPOTHESIS FORMATION    │
│                                   │
│  • Check for existing Hypothesis  │
│    in same taxonomy category /    │
│    entity scope                   │
│  • If exists: add Observation as  │
│    corroboration or contradiction │
│  • If not: create new Hypothesis  │
│  • GATE: Single-Observation       │
│    Hypotheses remain Provisional  │
│    — never promoted directly      │
│  • GATE: Contradictions reduce    │
│    confidence; competing          │
│    Hypotheses are tracked         │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│  STAGE 4: VALIDATION              │
│                                   │
│  • Accumulate corroborations      │
│    until required_corroborations  │
│    threshold is met               │
│  • Monitor for contradictions     │
│  • Timeout: Hypothesis without    │
│    corroboration in 30 days       │
│    → discarded (non-permanent)    │
│  • GATE: Corroboration            │
│    thresholds vary by taxonomy    │
│    category stability class:      │
│    Permanent → 2 corroborations   │
│    Long-Term → 3 corroborations   │
│    Medium-Term → 2 corroborations │
│    (faster validation cycle)      │
└──────────────┬────────────────────┘
               │ Threshold met, no unresolved
               │ high-confidence contradictions
               ▼
┌───────────────────────────────────┐
│  STAGE 5: LEARNING CREATION       │
│                                   │
│  • Promote validated Hypothesis   │
│    to Learning                    │
│  • Assign stability_class         │
│    (from Taxonomy)                │
│  • Assign decay_rate              │
│    (from stability_class)         │
│  • Assign context_scope           │
│    (global / artifact / project / │
│    audience)                      │
│  • Enter Intelligence State       │
│    Machine as VALIDATED           │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────┐
│  STAGE 6: INTELLIGENCE PROFILE    │
│           UPDATE                  │
│                                   │
│  • Write Learning to domain store │
│  • Update Intelligence Profile    │
│    composite confidence score     │
│  • Trigger Blueprint refresh for  │
│    affected artifact types        │
│  • Flag next artifact of          │
│    affected type for enhanced     │
│    quality evaluation             │
└──────────────┬────────────────────┘
               │
               ▼
        NEXT ARTIFACT IS BETTER
```

---

## D.2 — Stage-by-Stage Comparison

| Concept | Definition | Persistence | Confidence-Scored? | Triggers |
|---------|-----------|-------------|-------------------|---------|
| **Signal** | Raw extracted observation from any interaction event | Ephemeral — processed then discarded | No | Input event occurs |
| **Observation** | Structured Signal with source metadata and initial confidence | Short-term — consumed by Hypothesis stage | Yes (initial estimate) | Signal passes quarantine gate |
| **Hypothesis** | Provisional proposition awaiting validation | Provisional — survives until confirmed, contradicted, or timed out | Yes (evolves) | Observation without matching Hypothesis; or added to existing |
| **Validated Hypothesis** | Hypothesis that has met corroboration threshold with no unresolved contradictions | Awaiting promotion | Yes (stable) | Corroboration threshold met |
| **Learning** | Confirmed, persistent intelligence with full lifecycle | Persistent through state machine | Yes (maintained through lifecycle) | Validated Hypothesis promoted |
| **Intelligence** | The operationalized form of all active Learnings in the Intelligence Profile | Persistent; versioned | Yes (composite) | Learning added, updated, or decayed |

---

## D.3 — Confidence Handling Rules

| Rule | Description |
|------|-------------|
| **Ceiling Rule** | Source quality sets a confidence ceiling. An inferred Observation can never produce a High-confidence Learning without additional, higher-quality corroborations. |
| **Contradiction Rule** | A contradicting Observation of equal or greater source quality halves the Hypothesis confidence. Two contradictions of any quality require explicit resolution before promotion. |
| **Context Isolation Rule** | Confidence scores are context-scoped. A High-confidence Learning that a User prefers concise writing in executive summaries does not grant any confidence that the User prefers brevity in research papers. |
| **Decay Continuity Rule** | Decaying Learnings retain their last confident value until threshold is crossed. They are not immediately zeroed — they degrade gradually at rates determined by stability_class. |
| **Correction Override Rule** | An explicit User correction immediately sets the corrected Learning to Confirmed confidence and supersedes the prior Learning. User correction is the highest-quality signal in the system. |
| **Recency Weighting Rule** | For medium-term and decaying stability classes, more recent corroborations carry higher weight than older ones. The Learning's effective confidence is a weighted average biased toward recency. |

---

## D.4 — Escalation Rules

| Condition | Escalation Action |
|-----------|------------------|
| Hypothesis accumulates 3+ corroborations with 0 contradictions | Promote directly to Learning with High confidence |
| Hypothesis accumulates 2+ contradictions from high-quality sources | Surface to User for explicit resolution; do not auto-resolve |
| Competing Hypotheses in same category for same entity | Maintain both at reduced confidence; surface to User if persists > 3 sessions |
| Learning in permanent stability class receives strong contradictory signal | Do not auto-demote; generate alert for User review |
| Recurring Conflict ≥ 3 times in same context | Create persistent Conflict Record; surface to User for resolution rather than applying default resolution rule |
| Intelligence Profile overall confidence drops below 40% | Flag for onboarding re-enrichment; do not use low-confidence dimensions for artifact calibration |

---

# Section E — Intelligence State Machine

## E.1 — Required States

After derivation from the approved architecture and taxonomy, the following states are required. States that appear in the architecture (`Created`, `Validated`, `Confirmed`, `Active`) are retained. Additional states are added where the lifecycle demands them.

| State | Description | Applies To |
|-------|-------------|-----------|
| **PROVISIONAL** | A Hypothesis or early Learning formed from a single or very small number of observations. Not yet used in generation calibration. | Hypothesis, early Learning |
| **ACCUMULATING** | A Hypothesis that has received ≥ 1 corroboration but has not yet met the promotion threshold. Growing confidence. | Hypothesis |
| **CHALLENGED** | A Hypothesis or Learning that has received one or more contradicting observations. Confidence reduced. Requires additional corroboration to proceed. | Hypothesis, Learning |
| **VALIDATED** | A Hypothesis that has met its corroboration threshold and has been promoted to a Learning. Active in generation with validated confidence. | Learning |
| **CONFIRMED** | A Learning that has received additional post-promotion corroborations. High or Very High confidence. The primary state for artifact calibration. | Learning |
| **ACTIVE** | A Learning that is within its stable lifecycle window — neither recently promoted nor showing decay signals. Standard operating state. | Learning (synonym for Confirmed at steady state) |
| **DECAYING** | A Learning that has exceeded its revalidation window or received context-shift signals. Confidence degrading at defined rate. Still used in generation but flagged as requiring refresh. | Learning |
| **FLAGGED** | A Learning that has received a strong contradictory signal but has not yet been superseded. Generation uses it with a confidence discount pending resolution. | Learning |
| **ARCHIVED** | A Learning that has been explicitly superseded by a newer version, or whose confidence has decayed below the usable threshold. Not actively loaded in generation but accessible for reference. | Learning, Pattern, Profile version |
| **RETIRED** | A Learning that has been confirmed as no longer relevant to the User's current model and has not been queried in > 18 months. Removed from active stores. | Learning, Project model |

---

## E.2 — Formal State Machine

```
                    ┌─────────────────┐
         INPUT      │                 │     Insufficient observations
         EVENT ────►│  PROVISIONAL    │─────────────────────────────► DISCARDED
                    │                 │
                    └────────┬────────┘
                             │ ≥ 1 corroboration received
                             ▼
                    ┌─────────────────┐
                    │                 │
                    │  ACCUMULATING   │◄─────────────────────────────┐
                    │                 │                               │
                    └────────┬────────┘                               │
                             │                                         │
              ┌──────────────┼──────────────┐                         │
              │              │              │                          │
    Contradiction      Threshold      Timeout (30d,                    │
    received           not met,       non-permanent)                   │
              │        timer          │                               │
              ▼        running        ▼                               │
    ┌──────────────────┐      ┌──────────────┐                       │
    │                  │      │              │                        │
    │   CHALLENGED     │      │  DISCARDED   │                       │
    │                  │      │              │                        │
    └────────┬─────────┘      └──────────────┘                       │
             │                                                         │
    ┌─────── ┼ ───────────────────────────────┐                       │
    │        │                                │                       │
    │  More contradictions            Resolution                      │
    │  (≥ 2 high-quality)             corroboration                   │
    │        │                                │                       │
    │        ▼                                └───────────────────────┘
    │   REJECTED/DISCARDED
    │
    │ Promotion threshold met,
    │ no unresolved contradictions
    ▼
┌──────────────────────────────────┐
│                                  │
│         VALIDATED                │◄──── (Hypothesis promoted to Learning)
│   (Learning created)             │
│                                  │
└────────────────┬─────────────────┘
                 │
     ┌───────────┼───────────────┐
     │           │               │
     │   Additional        Contradictory
     │   corroborations    signal received
     │           │               │
     ▼           ▼               ▼
  ACTIVE   CONFIRMED         FLAGGED
     │           │               │
     │           │         ┌─────┴──────────────────┐
     │           │         │                         │
     │           │    Contradiction    Corroboration
     │           │    confirmed        received
     │           │         │                         │
     │           │         ▼                         │
     │           │   ARCHIVED ◄──── superseded ──────┘
     │           │   (prior version)
     │           │
     │     Stability window exceeded /
     │     Context-shift signal received
     │           │
     └─────────► ▼
              DECAYING
                 │
      ┌──────────┼──────────────────┐
      │          │                  │
  Revalidation  Confidence      Explicit User
  corroboration below           action
  received      threshold
      │          │                  │
      ▼          ▼                  ▼
  CONFIRMED   ARCHIVED           ARCHIVED
                                 (on User
                                  override)
                 │
             18+ months,
             no queries
                 │
                 ▼
             RETIRED
```

---

## E.3 — State Transition Table

| From | To | Entry Condition | Exit Condition | Confidence Impact |
|------|----|----------------|----------------|------------------|
| PROVISIONAL | ACCUMULATING | ≥ 1 corroborating observation received | Threshold met or timeout | +confidence per corroboration |
| PROVISIONAL | DISCARDED | No corroboration within 30 days (non-permanent) | N/A | N/A |
| ACCUMULATING | CHALLENGED | Contradicting observation received | Resolution (see below) | −50% on first contradiction |
| ACCUMULATING | VALIDATED | Corroboration threshold met, no unresolved contradictions | N/A | Carry forward |
| ACCUMULATING | DISCARDED | Timeout without threshold | N/A | N/A |
| CHALLENGED | ACCUMULATING | Corroborating observation received, outweighs contradiction | Threshold met or further challenge | Restore partial confidence |
| CHALLENGED | REJECTED | ≥ 2 high-quality contradictions | N/A | Confidence → 0 |
| VALIDATED | CONFIRMED | Additional post-promotion corroborations | N/A | +confidence |
| VALIDATED | FLAGGED | Contradictory signal received | Resolution | −25% confidence discount applied |
| CONFIRMED | DECAYING | Stability window exceeded without revalidation | Revalidation or further decay | −decay_rate per period |
| CONFIRMED | FLAGGED | Strong contradictory signal | Resolution | −25% confidence discount |
| ACTIVE | DECAYING | Stability window exceeded | Revalidation or archival | Gradual reduction |
| FLAGGED | CONFIRMED | Corroboration received / User confirms Learning | N/A | Restore + flag cleared |
| FLAGGED | ARCHIVED | Contradiction confirmed / User corrects Learning | N/A | Superseded |
| DECAYING | CONFIRMED | Revalidation signal received | N/A | Reset decay clock; restore confidence |
| DECAYING | ARCHIVED | Confidence below usable threshold | N/A | Retired from active use |
| ARCHIVED | RETIRED | 18+ months, no queries | N/A | N/A |

---

## E.4 — Revalidation Triggers

| Stability Class | Revalidation Window | Trigger Event |
|----------------|--------------------|-----------------|
| Permanent | No automatic decay — explicit only | User correction; strong contradictory signal (High+ confidence, 2+ independent sources) |
| Long-Term | 12 months since last corroboration | Major career event; resume upload; sustained vocabulary shift |
| Medium-Term | 90 days since last corroboration | Goal reset; role change; project close; explicit User request |
| Decaying | 30 days since last corroboration | Any relevant interaction; use it or decay |

---

# Section F — Domain Ownership Model

## F.1 — Entity Domain Ownership Map

| Entity | Primary Owner | Secondary Owner | Shared Ownership Rules | Conflict Boundary |
|--------|--------------|----------------|----------------------|------------------|
| User | User Intelligence | — | No sharing — User entity is the root | N/A |
| Intelligence Profile | User Intelligence | — | Profile is owned wholly by User Intelligence | Other domains consume it; they do not own it |
| Archetype | User Intelligence | — | Archetypes belong exclusively to the User model | N/A |
| Workspace | Workspace Intelligence | — | No sharing — Workspace is the root of its domain | N/A |
| Project | Project Intelligence | User Intelligence | User Intelligence owns the User who creates it; Project Intelligence owns everything within it | Project-level goals do not migrate to User-level without explicit promotion |
| Artifact | Artifact Intelligence | Project Intelligence | Artifact Intelligence owns structure and patterns; Project Intelligence owns the artifact's context and relationship to the project | Structure lives in Artifact Intelligence; purpose lives in Project Intelligence |
| Artifact Blueprint | Artifact Intelligence | User Intelligence, Project Intelligence, Relationship Intelligence | Blueprint is assembled from multiple domain inputs but owned by Artifact Intelligence as the synthesis layer | Conflicts in blueprint assembly are resolved by Section J rules |
| Artifact Pattern | Artifact Intelligence | — | User-calibrated patterns are owned by Artifact Intelligence scoped to the user | Patterns do not live in User Intelligence even though they are user-specific |
| Artifact Exemplar | Artifact Intelligence | — | Exemplars may be used for cross-user pattern aggregation only in anonymized form | Raw Exemplars are user-private |
| Relationship | Relationship Intelligence | User Intelligence | Relationships are user-owned; the intelligence model of each relationship is Relationship Intelligence's domain | Named, specific Relationships belong to Relationship Intelligence; generic audience types belong to User Intelligence |
| Audience Profile | Relationship Intelligence | User Intelligence | Specific Relationship-linked profiles: Relationship Intelligence. Generic class profiles: User Intelligence | When both exist for same artifact, Relationship Intelligence wins |
| Goal (user) | User Intelligence | — | User-level goals are exclusively User Intelligence | Project goals must not inherit into user-level goal store |
| Goal (project) | Project Intelligence | User Intelligence | Project Intelligence owns within project; User Intelligence notes the goal exists for cross-project pattern awareness | Project goals do not override User goals — they add context |
| Constraint (user) | User Intelligence | — | User-level constraints are exclusively User Intelligence | Workspace compliance constraints are not user constraints |
| Constraint (project) | Project Intelligence | User Intelligence | Project Intelligence owns within project | Project constraints do not permanently modify User constraints |
| Constraint (compliance) | Workspace Intelligence | — | Compliance constraints apply to all Users in workspace; no user can override | These are immutable — see Section J Rule 5 |
| Preference | User Intelligence | Artifact Intelligence | Cross-artifact preferences: User Intelligence. Artifact-type-specific preferences: shared with Artifact Intelligence | Artifact-type preferences are expressed through Artifact Patterns; global preferences live in User Intelligence |
| Framework | User Intelligence | Knowledge Intelligence (if enabled) | Frameworks identified in uploaded Knowledge Assets are registered in both | Knowledge Intelligence owns the source; User Intelligence owns the personal application model |
| Knowledge Asset (user) | Knowledge Intelligence | User Intelligence | Knowledge Assets are the domain of Knowledge Intelligence; User Intelligence references them | See Section I for full ruling |
| Knowledge Asset (workspace) | Knowledge Intelligence | Workspace Intelligence | Workspace-owned assets serve all workspace users | See Section I |
| Knowledge Asset (project) | Knowledge Intelligence | Project Intelligence | Project-scoped assets serve artifact generation within that project | See Section I |
| Signal | Learning Pipeline (system) | All Domains | Signals are not domain-owned — they are pipeline-stage objects | Signals are processed by the pipeline; their output (Learnings) are domain-owned |
| Observation | Learning Pipeline (system) | — | Pipeline-internal | N/A |
| Hypothesis | Learning Pipeline (system) | — | Pipeline-internal | N/A |
| Learning | Domain of the Learning's subject | Learning Pipeline | The domain of the entity the Learning describes owns the Learning | Cross-domain Learnings are owned by the most specific applicable domain |
| Conflict | Cross-Domain | — | Conflicts are surfaced to the Conflict Resolution Model; no single domain owns them | Resolution rules in Section J determine which domain's intelligence takes precedence |
| Feedback Event | Artifact Intelligence | All Domains | Feedback Events belong to the Artifact that triggered them; their Signals are processed by the pipeline and distributed to relevant domains | N/A |
| Vocabulary Model | User Intelligence | Workspace Intelligence, Project Intelligence | User vocabulary: User Intelligence. Workspace vocabulary: Workspace Intelligence. Project-specific terms: Project Intelligence | Hierarchy: Project vocabulary overrides within project; Workspace vocabulary governs external artifacts |
| Operating Principle | User Intelligence | — | Operating principles are exclusively user-owned; they are near-permanent | Workspace compliance constraints are not Operating Principles |

---

## F.2 — Domain Inheritance Rules

```
DOMAIN INHERITANCE HIERARCHY

┌──────────────────────────────────────────────────────────────┐
│  WORKSPACE INTELLIGENCE (Context Layer)                       │
│  Owns: Vocabulary · Standards · Shared Assets · Compliance   │
│  Governs: All artifacts produced within the workspace         │
└──────────────────────────┬───────────────────────────────────┘
                           │ contextualizes
┌──────────────────────────▼───────────────────────────────────┐
│  PROJECT INTELLIGENCE (Scope Layer)                           │
│  Owns: Project Goals · Vocabulary · Stakeholders · Assets    │
│  Inherits from Workspace; overrides within project scope      │
└──────────────────────────┬───────────────────────────────────┘
                           │ grounds
┌──────────────────────────▼───────────────────────────────────┐
│  USER INTELLIGENCE (Foundation Layer)                         │
│  Owns: Voice · Expertise · Goals · Frameworks · Identity     │
│  Applies across all projects; modified by project scope       │
└──────────────────────────┬───────────────────────────────────┘
                           │ calibrates
┌──────────────────────────▼───────────────────────────────────┐
│  ARTIFACT INTELLIGENCE (Synthesis Layer)                      │
│  Owns: Structure Patterns · Exemplars · Narrative Models      │
│  Synthesizes from all domains above into a Blueprint          │
└──────────────────────────┬───────────────────────────────────┘
                           │ enriched by
┌──────────────────────────▼───────────────────────────────────┐
│  RELATIONSHIP INTELLIGENCE (Calibration Layer)                │
│  Owns: Audience Profiles · Recipient Intelligence             │
│  Applied as the final calibration pass for external artifacts │
└──────────────────────────┬───────────────────────────────────┘
                           │ produces
                    ┌──────▼──────┐
                    │   ARTIFACT   │
                    └─────────────┘
```

**The Inheritance Rule:** Lower layers inherit from higher layers but may override within their scope. A User's vocabulary modifies Workspace vocabulary for their output style — it does not replace it for external artifacts. A Project vocabulary overrides User vocabulary within project scope only.

---

# Section G — Project Intelligence Schema

## G.1 — Project as First-Class Entity

Projects are first-class entities because most high-value professional work produces not isolated artifacts but coherent streams of related artifacts in service of a single initiative. Without Project Intelligence, each artifact is generated as if prior artifacts in the same initiative do not exist. With it, artifact coherence, vocabulary consistency, and strategic alignment compound across every generated artifact within the project.

---

## G.2 — Project Structure

| Component | Description | Stability |
|-----------|-------------|-----------|
| **Project Identity** | Name, type, primary objective, success criteria | Stable once set; updated on explicit revision |
| **Project Lifecycle State** | Ideation → Scoping → Execution → Wind-Down → Archived | Transitions on explicit event or inactivity signal |
| **Project Goals** | The outcomes the project must deliver (distinct from User's personal goals) | Medium-term; confirmed per milestone cycle |
| **Project Stakeholders** | The people involved in or affected by the project | Medium-term; updated on team/relationship changes |
| **Project Vocabulary** | Terminology, naming conventions, and acronyms specific to this project | Long-term within project; not exported to User model |
| **Project Assets** | Documents, templates, and materials produced within or uploaded to the project | Permanent within project archive |
| **Project Constraints** | Budget, technology, regulatory, timeline, scope limits | Medium-term; updated on explicit change |
| **Project Preferences** | Artifact format, depth, and communication preferences specific to this project | Long-term within project; may diverge from User-level preferences |
| **Project Knowledge** | IP, frameworks, and methodologies specific to this project (registered as Knowledge Assets) | Permanent; archived on project close |
| **Artifact History** | Record of all artifacts generated within the project | Permanent; enables cross-artifact consistency |

---

## G.3 — Project Lifecycle

| Stage | Entry Condition | Active Intelligence Behaviors | Exit Condition |
|-------|---------------|------------------------------|----------------|
| **Ideation** | Project created; initial description provided | Capture project type, primary objective; initialize vocabulary model | User moves to Scoping or abandons |
| **Scoping** | Project goals, constraints, and stakeholders defined | Confirm goal and constraint models; identify primary audiences | Execution artifacts begin being generated |
| **Execution** | Active artifact generation | Full intelligence accumulation; vocabulary, pattern, and feedback learning | Activity drops; milestone signals wind-down |
| **Wind-Down** | No new artifacts in > 60 days; User signals completion | Confidence decay begins on dynamic parameters; initiate archival sequence | User confirms closure |
| **Archived** | User confirms project complete | Transfer exportable learnings to User domain; freeze project model | 18+ months with no queries → Retired |
| **Retired** | Archived for > 18 months, no queries | Moved to cold store; not actively loaded | N/A |

---

## G.4 — What Transfers from Project to User on Archival

| Intelligence Type | Transfer to User Domain? | Conditions |
|-----------------|--------------------------|-----------|
| Project-specific vocabulary | No — stays in project archive | Referenced only when project is retrieved |
| New skills demonstrated during project | Yes — as enrichment to Skills Inventory Learning | Only if consistently demonstrated across ≥ 3 project artifacts |
| New audiences encountered | Yes — as enrichment to Audience Intelligence | If audience type not already modeled |
| New Framework used or developed | Yes — if proprietary, registers as Knowledge Asset | Requires User confirmation |
| Project-specific constraints | No — stays project-scoped | |
| Artifact patterns reinforced during project | Yes — as input to user-calibrated Artifact Patterns | Automatically applied by Artifact Intelligence |

---

## G.5 — Project Interaction Model

| Interacts With | Interaction Type | Rules |
|---------------|-----------------|-------|
| **User** | Project is created by User; User Intelligence provides baseline for all project artifacts | User model is read-only for Project Intelligence; Project Intelligence writes back only on explicit archival export |
| **Artifacts** | All Artifacts generated in project context reference project intelligence | Artifacts carry a project_id that enables cross-artifact consistency checks |
| **Relationships** | Project may introduce new Relationships or activate existing ones in a project-specific context | Relationship Intelligence profiles may be enriched with project-specific notes; these are maintained in Relationship domain |
| **Workspace** | Project inherits Workspace standards; must not violate compliance constraints | Project Intelligence may request Workspace standard exceptions; these require explicit admin authorization |

---

# Section H — Artifact Intelligence Schema

## H.1 — The Artifact as the System's Primary Output

BrandOS is not a retrieval system or a memory system. It is an artifact generation system. Artifact Intelligence is the only domain that directly models the output — rather than the person, context, or audience. Every other domain feeds into Artifact Intelligence's synthesis layer to produce the Artifact Blueprint. The compounding quality of BrandOS is therefore inseparable from the quality of its Artifact Intelligence.

---

## H.2 — Artifact Intelligence Entities

| Entity | Purpose | Ownership | Lifecycle |
|--------|---------|-----------|-----------|
| **Artifact** | The discrete generated output. The system's value unit. | Artifact Intelligence / Project Intelligence | Created → Delivered → Evaluated → Signals extracted → May become Exemplar |
| **Artifact Blueprint** | The structural specification for one specific artifact, assembled from Pattern, context, and preferences before generation begins | Artifact Intelligence (synthesis) | Ephemeral — created per generation event; accepted version may become Exemplar reference |
| **Artifact Pattern** | A validated structural model for an artifact type at a given level (universal / archetype / user-calibrated) | Artifact Intelligence | Long-term; reinforced by acceptance; updated by editing patterns; three levels of specificity |
| **Artifact Exemplar** | A specific accepted artifact that serves as a positive structural reference for future Blueprint generation | Artifact Intelligence | Permanent reference within its scope; may be superseded but is retained for audit |
| **Artifact Preference** | A user-specific preference related to one or more artifact types (may be format, depth, length, narrative, section emphasis) | User Intelligence (cross-artifact) / Artifact Intelligence (type-specific) | Long-term; updated by consistent Feedback Events |
| **Artifact Feedback** | A structured Feedback Event specific to an artifact's structural, content, or stylistic dimensions | Artifact Intelligence (consumes) | Processed immediately into Signals; raw event retained for audit |

---

## H.3 — Three-Level Pattern Architecture

Artifact Patterns exist at three levels of specificity, each inherited by the one below:

```
LEVEL 1: UNIVERSAL PATTERN
Purpose: The canonical structural baseline for an artifact type
         across all users and archetypes.
Applies: From Day 1 — the pre-built baseline.
Source:  Human-curated; refined by cross-user acceptance data
         at scale (> 10K users).
Example: A board update universally has: Executive Summary /
         Progress vs. Plan / Key Metrics / Risks / Asks.
         This structure is correct for nearly all boards.

         ↓ inherited by

LEVEL 2: ARCHETYPE PATTERN
Purpose: The structural baseline for an artifact type, modified
         for a specific professional archetype.
Applies: When the User's primary Archetype is confirmed.
Source:  Universal Pattern + archetype-specific accepted
         artifacts.
Example: A Founder's board update emphasizes product traction
         metrics over operational reviews. An Enterprise Team
         Member's board update has a different section emphasis.

         ↓ inherited by

LEVEL 3: USER-CALIBRATED PATTERN
Purpose: The structural model built specifically from this User's
         accepted, edited, and rejected artifacts.
Applies: After ≥ 2 accepted artifacts of the type.
Source:  This User's Feedback Events and editing patterns.
Example: This specific Founder prefers to lead their board
         update with a Narrative Frame before metrics, not the
         other way around. Level 3 captures this preference.
         Level 1 and 2 do not.
```

---

## H.4 — How Successful Artifacts Improve Future Artifacts

| Stage | Mechanism | Compounding Effect |
|-------|-----------|-------------------|
| **Artifact Accepted Without Edit** | High-weight positive signal to all structural elements | Pattern confidence increases; section structure reinforced; length baseline updated |
| **Artifact Accepted With Edits** | Positive signal to accepted elements; neutral/negative to consistently edited elements | Editing patterns are tracked; if the same section is edited ≥ 3 times the same way, that edit becomes a Pattern update |
| **Artifact Deployed (Used Externally)** | Very high-weight positive signal | Marks artifact as Exemplar candidate; strongest available positive reinforcement |
| **Artifact Rejected** | Negative signal to structural, depth, and style dimensions | Rejection patterns are added to `known_rejection_triggers[]` on the Pattern; single rejections do not trigger immediate pattern change |
| **Cross-Artifact Pattern Recognition** | At scale (> 10K users), anonymized acceptance patterns inform universal and archetype patterns | Individual user benefit from collective acceptance intelligence without personal data exposure |

---

## H.5 — Artifact Intelligence Accumulation Over Time

```
SESSION 1:       Universal Pattern applied
                 First artifact generated
                 First Feedback Event captured

MONTH 1:         2-3 accepted exemplars per common artifact type
                 User-calibrated pattern formation begins
                 Length and depth baselines established

MONTH 3:         User-calibrated patterns active for top 3-5 artifact types
                 Rejection triggers identified
                 Editing pattern trends emerging

MONTH 6:         Stable, high-confidence user-calibrated patterns
                 Exemplar library active for Blueprint reference
                 Artifact quality requires minimal post-generation editing

YEAR 1:          Artifact Intelligence compounds with Project history
                 Cross-project pattern recognition available
                 Section-level personalization consistent and confident

YEAR 2+:         Artifact quality approaches ghost-writing threshold
                 System anticipates structure before User specifies it
```

---

# Section I — Knowledge Intelligence: Architectural Ruling

## I.1 — The Question

Should Knowledge Intelligence exist as a first-class intelligence domain — coordinate with User Intelligence, Project Intelligence, Artifact Intelligence, Relationship Intelligence, and Workspace Intelligence — or should Knowledge Assets be absorbed into existing domains?

---

## I.2 — The Case For a First-Class Knowledge Intelligence Domain

| Argument | Assessment |
|----------|-----------|
| Knowledge Assets (playbooks, frameworks, IP, methodologies) are structurally distinct from other intelligence — they are not learnings about a person, they are external artifacts that inform generation | **Strong** — the distinction between intelligence about the user and intellectual property owned by the user is real and structurally meaningful |
| Knowledge Assets can be owned at three levels simultaneously: User, Project, and Workspace — this cross-ownership pattern requires a domain that transcends the other domains | **Strong** — no existing domain can cleanly own all three scopes |
| Knowledge Assets have their own lifecycle: uploaded → verified → versioned → deprecated — this lifecycle does not fit cleanly into any existing domain's lifecycle model | **Strong** — forcing Knowledge Assets into User Intelligence would corrupt the User model's lifecycle logic |
| Knowledge Assets are the richest single intelligence source in the taxonomy (per the Taxonomy's own assessment: +80% artifact authenticity) — their importance justifies dedicated domain governance | **Strong** — the highest-impact single signal deserves first-class architectural treatment |
| Knowledge Assets may be shared across Users within a Workspace (shared playbooks, org frameworks) — this multi-user ownership is foreign to User Intelligence's single-owner model | **Strong** — User Intelligence has no mechanism for multi-user asset sharing |

## I.3 — The Case Against

| Argument | Assessment |
|----------|-----------|
| Knowledge Assets are already captured as a taxonomy category within User Intelligence — introducing a new domain risks duplication | **Weak** — the taxonomy identifying a category does not determine its architectural home. By this logic, Audience Intelligence could be absorbed into User Intelligence rather than Relationship Intelligence, which would be architecturally incorrect |
| Knowledge Intelligence adds architectural complexity with limited GTM value — it can wait | **Partially valid for GTM** — but it is architecturally incorrect to defer a necessary domain purely for launch simplicity, especially when doing so requires restructuring on Phase 2 |
| All Knowledge Asset functions can be served by tagging Knowledge Assets within Project or User Intelligence | **Weak** — tagging within a domain is not the same as governing a domain. Cross-ownership (User + Project + Workspace) cannot be managed by tags inside a single domain without ownership ambiguity |

---

## I.4 — Ruling: Knowledge Intelligence SHOULD Exist as a First-Class Domain

**The ruling is YES — Knowledge Intelligence is a first-class domain.**

The architectural argument is decisive on three grounds:

**Ground 1 — Cross-Ownership Irreducibility.** Knowledge Assets can simultaneously belong to a User (personal IP), a Project (project-specific IP), and a Workspace (shared organizational IP). No existing domain owns all three scopes. Attempting to house Knowledge Assets in User Intelligence would corrupt the single-owner model. Attempting to house them in Project Intelligence would prevent workspace-level and cross-project sharing. A first-class Knowledge Intelligence domain resolves this cleanly.

**Ground 2 — Lifecycle Distinctiveness.** Knowledge Assets have a lifecycle (upload → verify → version → deprecate) that does not align with the Hypothesis → Learning lifecycle of the other domains. They are not learned from behavior — they are submitted as explicit, structured intelligence. Their update model (versioned re-upload) is structurally different from the Signal → Observation → Hypothesis pipeline.

**Ground 3 — Downstream Impact.** The Taxonomy's own assessment rates Knowledge Assets as producing +80% artifact authenticity lift — the single highest-impact intelligence source. The architectural governance of the highest-impact intelligence source must be first-class, not subordinated to a domain with a different primary purpose.

---

## I.5 — Knowledge Intelligence Schema

### I.5.1 — Domain Definition

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Own, govern, and make available the proprietary intellectual property, frameworks, methodologies, and knowledge assets that Users, Projects, and Workspaces possess — ensuring that generated artifacts extend rather than merely imitate the User's own IP. |
| **Core Questions Answered** | What proprietary IP does this User/Project/Workspace possess? How can artifact generation extend, apply, and reference this IP authentically? How should IP be versioned, shared, and protected? |
| **Stability** | Permanent (assets persist until explicitly deprecated) |
| **Impact on Artifact Quality** | Critical — the highest single-source quality multiplier |

### I.5.2 — Knowledge Intelligence Entities

| Entity | Description | Owner Scope | Lifecycle |
|--------|-------------|-------------|-----------|
| **Knowledge Asset** | A discrete piece of proprietary intellectual property: framework, methodology, playbook, model, IP document | User / Project / Workspace | Upload → Verify → Active → Versioned (on re-upload) → Deprecated |
| **Knowledge Asset Version** | A specific version of a Knowledge Asset. Prior versions are retained for reference. | Same as parent Asset | Created on re-upload; archived when superseded |
| **Knowledge Vocabulary** | Terminology extracted from a Knowledge Asset that must be applied in artifacts that reference the asset | Inherits from Knowledge Asset | Extracted at upload; updated on asset version change |
| **Knowledge Pattern** | A structural or argumentative pattern extracted from a Knowledge Asset that may inform Artifact Blueprint generation | Inherits from Knowledge Asset | Extracted at upload; refined as asset is used in accepted artifacts |
| **Knowledge Access Rule** | Defines who may access a Knowledge Asset (user-only / project / workspace) | Workspace / User | Set at upload; modifiable by owner |

### I.5.3 — Knowledge Intelligence Lifecycle

| Stage | Trigger | Action |
|-------|---------|--------|
| **Upload** | User or admin uploads a document, framework, or methodology | Initialize Knowledge Asset; extract vocabulary, patterns, and structure |
| **Verification** | System extracts initial intelligence; User reviews and confirms | Escalate confidence to Very High; register Knowledge Vocabulary and Knowledge Patterns |
| **Active** | Confirmed; available for artifact generation reference | Loaded as context when relevant artifact type is requested |
| **Versioned** | User re-uploads updated version | Create new Version; archive prior version; update extracted vocabulary and patterns |
| **Deprecated** | User explicitly marks asset as no longer valid | Remove from active generation context; retain in archive for reference |

### I.5.4 — Knowledge Intelligence Relationships

| Relationship | Type | Notes |
|-------------|------|-------|
| Knowledge Asset → User | Many:One (user-owned assets) | User-scoped assets are private to that User unless shared |
| Knowledge Asset → Project | Many:One (project-scoped assets) | Project-scoped assets are accessible to all Users on the project |
| Knowledge Asset → Workspace | Many:One (workspace assets) | Workspace assets are accessible to all Users in the Workspace |
| Knowledge Asset → Framework | One:Many | Frameworks detected in a Knowledge Asset are registered in User Intelligence with Knowledge Asset as source |
| Knowledge Asset → Knowledge Vocabulary | One:Many | Vocabulary is extracted and registered at upload |
| Knowledge Asset → Artifact Blueprint | Many:Many | A Blueprint may reference multiple Knowledge Assets; a Knowledge Asset may be referenced in multiple Blueprints |
| Knowledge Intelligence → User Intelligence | Reference | User Intelligence references Knowledge Assets for vocabulary and framework enrichment; it does not own them |
| Knowledge Intelligence → Artifact Intelligence | Reference | Artifact Intelligence consults Knowledge Assets when building Blueprints for artifact types where the asset is relevant |

### I.5.5 — What Knowledge Intelligence Does Not Own

| Item | Actual Owner | Reason |
|------|-------------|--------|
| The User's writing style learned from assets | User Intelligence | Style is a User property, not an IP property |
| Project goals inferred from a project playbook | Project Intelligence | Goals belong to projects, not to the asset that describes them |
| Audience profiles described in a methodology | Relationship Intelligence | Audience profiles are relationship properties |
| Artifact structure patterns extracted from the asset | Artifact Intelligence | Structural patterns belong to the Artifact domain |

---

# Section J — Intelligence Conflict Model

## J.1 — Why Conflicts Are Structural, Not Edge Cases

BrandOS models five (now six, with Knowledge Intelligence) distinct intelligence domains simultaneously. Conflict between these domains is not an exception — it is the expected outcome any time a User with strong preferences operates within a Workspace with strong standards, generating an artifact for a specific Relationship with its own expectations, in the context of a Project with its own constraints. The Conflict Model must be explicit, predictable, and transparent.

---

## J.2 — Conflict Entity

| Attribute | Definition |
|-----------|-----------|
| `conflict_id` | Unique identifier |
| `conflict_type` | See taxonomy below |
| `entity_a_type` / `entity_a_id` | First party in conflict |
| `entity_b_type` / `entity_b_id` | Second party in conflict |
| `authority_level_a` | Precedence level of entity A (1–5) |
| `authority_level_b` | Precedence level of entity B (1–5) |
| `resolution_rule_applied` | Which Rule (1–5, Section J.4) was applied |
| `resolution_outcome` | What the generation did as a result |
| `user_notified` | Whether the User was told of the conflict and departure |
| `artifact_id` | The artifact in whose generation the conflict occurred |
| `recurring_count` | How many times this conflict has appeared |
| `escalated` | Whether the conflict was escalated to the User for explicit resolution |

---

## J.3 — Conflict Type Taxonomy

| Conflict Type | Example | Default Resolution |
|--------------|---------|-------------------|
| **User Preference vs. Project Requirement** | User prefers concise output; project requires comprehensive documentation | Additive Rule (Rule 3): Complete but concise |
| **User Style vs. Workspace Standard** | User informal tone; Workspace requires formal external communications | Scope Rule (Rule 1): Workspace wins for external artifacts |
| **User Goal vs. Project Goal** | User long-term goal is thought leadership; project goal is client delivery | Project goal governs artifact; User goal governs framing |
| **Audience Requirement vs. User Preference** | User prefers narrative prose; Relationship intelligence indicates recipient wants data tables | Recipient Rule (Rule 2): Recipient governs structure; User governs voice |
| **Project Vocabulary vs. Workspace Vocabulary** | Project uses internal naming; Workspace has approved external naming | Scope Rule (Rule 1): Project vocabulary within project scope; Workspace vocabulary for external artifacts |
| **Artifact Type Canonical Structure vs. User Structure Preference** | User prefers insights-first; artifact type canonical is context-first | Additive Rule (Rule 3): Canonical structure with User's preferred emphasis within sections |
| **Workspace Compliance vs. Anything** | Legal disclaimer required; conflicts with User's concise style preference | Immutability Rule (Rule 5): Compliance applied without exception |
| **Knowledge Asset vs. User Preference** | Knowledge Asset recommends a methodology structure; User prefers a different structure | User wins: Knowledge Assets inform, they do not mandate |

---

## J.4 — Five Resolution Rules

| Rule | Name | Statement | Precedence |
|------|------|-----------|-----------|
| **Rule 1** | The Scope Rule | The most specific intelligence to the current task wins within its scope. A project-specific vocabulary overrides the User's general vocabulary — but only within artifacts generated for that project. | Context-specificity |
| **Rule 2** | The Recipient Rule | When the artifact leaves the User's hands, the recipient's needs govern format, structure, and depth. The User's style governs voice and language. These operate at different levels and are not in conflict — they are resolved additively. | External artifact calibration |
| **Rule 3** | The Additive Rule | Where possible, conflicts should be resolved additively rather than by substitution. The document that must be comprehensive is written with the economy of the User who prefers concision. Both requirements are satisfied simultaneously. | Quality preservation |
| **Rule 4** | The Transparency Rule | When a conflict requires a significant departure from User preference, surface it in a natural way — "This follows a more detailed structure than your usual style because..." — and offer the User opportunity to override. | User trust |
| **Rule 5** | The Immutability Rule | Workspace-level compliance requirements (legal, regulatory, brand) cannot be overridden by User preference or Project scope. They are applied as a final pass, not as a preference in competition. | Compliance |

---

## J.5 — Precedence Hierarchy

```
CONFLICT PRECEDENCE HIERARCHY
(Higher level = greater authority in conflict)

LEVEL 5 — EXPLICIT USER OVERRIDE (In-Session)
  "Make this shorter than usual" / "Skip the exec summary this time"
  Highest authority — always honored immediately.
  Generates a session-scoped instruction, not a permanent Learning.

LEVEL 4 — CONFIRMED RECIPIENT REQUIREMENT
  Named Relationship intelligence: "This board requires financial tables"
  Overrides User style for recipient-facing artifacts.
  Does not modify the User's baseline style model.

LEVEL 3 — PROJECT SCOPE REQUIREMENT
  "This engagement requires comprehensive documentation"
  Overrides User general preferences within this project's artifacts.
  Does not modify the User's baseline preference model.

LEVEL 2 — WORKSPACE STANDARD
  Organizational requirements applying to all workspace users.
  Legal, regulatory, brand compliance.

LEVEL 1 — USER GENERAL PREFERENCE
  Long-term learned style, format, depth preferences.
  Default when no higher-level authority applies.
```

---

## J.6 — Escalation Rules

| Condition | Escalation Action |
|-----------|------------------|
| Conflict requires a departure of significance from User preference | Apply Transparency Rule (Rule 4); surface departure in generated response |
| Conflict cannot be resolved without unacceptable trade-offs | Generate with most defensible resolution; surface the conflict and trade-off; offer alternatives; wait for User direction |
| Conflict is recurring (≥ 3 times in same context) | Create persistent Conflict Record; do not silently resolve repeatedly; surface to User for durable resolution |
| User provides explicit override | Honor immediately; record as session-scoped instruction; note departure; do not update User's permanent preference model from a single override |
| Workspace compliance conflicts with User instruction | Apply Immutability Rule without exception; note the compliance requirement; do not offer override |

---

# Section K — Minimum Implementable Model

## K.1 — Prioritization Principle

The minimum implementable model is not the simplest model — it is the smallest model that produces a *meaningful and defensible quality advantage* over any alternative available to the User. Implementation begins with Phase 1. Every entity in Phase 1 must be present before any Phase 2 entity is introduced.

---

## K.2 — Phase 1: Mandatory Foundation (GTM-Ready)

These entities represent approximately 20% of the full schema by entity count and produce approximately 80% of the user-perceived artifact quality gain.

| Entity | Why Mandatory | Minimum Viable State |
|--------|--------------|---------------------|
| **User** | Root entity — nothing else exists without it | Created at registration |
| **Intelligence Profile** | The entity consulted during generation — without it, every artifact starts from zero | Initialized at onboarding; minimum viable content: Archetype + Voice + Goal |
| **Archetype** | Drives all default calibrations | Minimum: one Archetype at ≥ Medium confidence by end of session 1 |
| **Goal (User)** | Without Goals, relevance is impossible | Minimum: 1–3 active Goals established in session 1 |
| **Constraint (User)** | Prevents out-of-bounds generation | Minimum: key constraints (budget, team, technology) captured in onboarding |
| **Preference (Voice/Style)** | Style mismatch is the #1 rejection reason | Minimum: basic voice model from 2–3 writing samples at onboarding |
| **Knowledge Asset** | Highest single-source quality multiplier | Minimum: first upload event triggers extraction; available before first generation |
| **Artifact Pattern (Universal)** | Without structure intelligence, generation defaults to generic | Minimum: universal patterns for top 5–7 artifact types, human-curated pre-launch |
| **Artifact Blueprint** | The synthesis entity — without it, no intelligence is applied to generation | Required per generation event |
| **Feedback Event** | Without feedback capture, intelligence cannot grow | Required after every generation event |
| **Signal** | The pipeline input — without Signals, no Learnings are formed | Required per Feedback Event |
| **Project** | Context layer — transforms generic output into situationally relevant artifacts | Required when User declares a project; optional at GTM for users without active projects |

**What Phase 1 Does NOT Require:**

Hypothesis tracking (simplified confidence accumulation is sufficient), formal state machine (simplified accepted/provisional/archived is sufficient), Relationship Intelligence (Audience Profiles at User level substitute in Phase 1), Workspace Intelligence (single-user workspace only), Knowledge Intelligence formal domain (Knowledge Assets are tracked; formal domain governance activates in Phase 2), Conflict entity (conflict resolution rules are applied; formal Conflict records are created for escalations only).

---

## K.3 — Phase 2: High-Value Extensions

| Entity | Why High-Value | Activation Trigger |
|--------|---------------|-------------------|
| **Relationship** | Enables precise calibration of external artifacts for named recipients | When User generates ≥ 3 external artifacts; when named recipients appear consistently |
| **Audience Profile (Relationship-linked)** | Upgrades generic audience calibration to named-recipient intelligence | On Relationship creation |
| **Artifact Pattern (Archetype-level)** | Enables cross-user pattern intelligence by archetype | When Archetype confidence is Confirmed + sufficient accepted artifact volume |
| **Hypothesis (formal)** | Enables formal pipeline governance; required as Learning volume grows | When signal volume exceeds simple accumulation management |
| **Conflict (formal records)** | Required when recurring conflicts cannot be managed ephemerally | When recurring conflict patterns emerge |
| **Knowledge Intelligence (domain governance)** | Required when multi-user or multi-scope asset sharing is needed | Team product launch |
| **Workspace Intelligence** | Required for team and enterprise contexts | Team product launch |
| **Operating Principle** | Prevents value misalignment in strategic recommendations | When consistent operating principles are detected across ≥ 3 sessions |
| **Framework** | Enables higher-quality strategic and analytical artifacts | When consistent framework usage is detected across ≥ 3 distinct contexts |

---

## K.4 — Phase 3: Advanced Intelligence

| Entity / Capability | Description | Activation Trigger |
|--------------------|-----------|--------------------|
| **Cross-User Artifact Pattern Aggregation** | Universal pattern models informed by anonymized acceptance data across the user base | Scale milestone: > 10K active users |
| **Temporal/Behavioral Pattern** | Intelligence derived from when the User works, how urgency is expressed, and how session patterns evolve | 30+ days of behavioral data; Phase 3 learning window |
| **Emotional Register Model** | Tone calibration at the micro level; refinement within established style | Stable core model + significant sample size (> 50 artifacts) |
| **Multi-Archetype Weighting Model** | Formally weighted multi-archetype distributions for users who span multiple professional identities | When secondary archetypes reach ≥ Medium confidence |
| **Anticipatory Blueprint Generation** | System generates a Blueprint before the User explicitly requests a specific artifact type | Year 1+ relationship; high-confidence Intelligence Profile; confirmed Project context |
| **Cross-Project Pattern Recognition** | Intelligence that identifies patterns across a User's projects over time | ≥ 3 completed projects with Archived models |
| **Intelligence Versioning and Rollback** | Full versioned Intelligence Profiles with rollback capability | Phase 3 infrastructure readiness |

---

## K.5 — The Smallest Logical Schema for Meaningful Quality Improvement

```
PHASE 1 MINIMUM VIABLE SCHEMA
(Entities required to produce meaningful quality improvement)

USER
└── INTELLIGENCE PROFILE
      ├── ARCHETYPE (≥ 1, primary)
      ├── GOAL (1–3 active)
      ├── CONSTRAINT (key limits)
      └── PREFERENCE (voice/style basic)

PROJECT (optional at GTM, required for contextual generation)
├── GOAL (project-scoped)
├── CONSTRAINT (project-scoped)
└── KNOWLEDGE ASSET (first upload)

KNOWLEDGE ASSET (user-scoped, first upload)

ARTIFACT PATTERN (universal, human-curated, top 5–7 types)

[PER GENERATION EVENT]
└── ARTIFACT BLUEPRINT
      ├── from ARTIFACT PATTERN
      ├── from INTELLIGENCE PROFILE
      └── from PROJECT (if active)
      └── ARTIFACT
            └── FEEDBACK EVENT
                  └── SIGNAL
                        └── LEARNING → INTELLIGENCE PROFILE UPDATE
```

This schema — nine entity types with simplified lifecycle and confidence handling — produces all six GTM-listed quality lifts from the approved architecture:

- +70% relevance to user goals (Goal entities)
- +60% voice/style match (Preference/Voice model)
- +80% project-grounded accuracy (Project entities)
- +45% structure quality (Artifact Pattern entities)
- +80% artifact authenticity (Knowledge Asset entities)
- Compounding quality from session 1 (Feedback Event → Signal → Learning loop)

---

# Section L — Intelligence Contract Preparation

## L.1 — Purpose

This section prepares the logical schema for future extraction contracts (how intelligence is produced) and consumption contracts (how intelligence is used). Every major entity is assigned a Producer, Consumer, Validation Source, and Lifecycle Owner.

---

## L.2 — Contract Map

| Entity | Producer | Consumer | Validation Source | Lifecycle Owner |
|--------|---------|---------|-----------------|----------------|
| **User** | Registration / Onboarding System | All Domains | Self-referential (root entity) | User Intelligence |
| **Intelligence Profile** | User Intelligence (assembles from Learnings) | Artifact Blueprint Assembly; Generation System | Cross-domain Learning consistency checks | User Intelligence |
| **Archetype** | Learning Pipeline (from onboarding and behavioral signals) | Intelligence Profile; Artifact Pattern selection; default calibrations | Corroboration across multiple signal types; behavioral validation | User Intelligence |
| **Workspace** | Admin / Workspace Owner | All domain entities within the workspace scope | Admin confirmation; compliance review | Workspace Intelligence |
| **Project** | User (explicit creation) | Artifact Blueprint; Vocabulary Model; Constraint set; Goal set | User-confirmed goals and stakeholders | Project Intelligence |
| **Artifact Pattern (Universal)** | Human curation at launch; scale aggregation post-launch | Artifact Blueprint Assembly | Cross-user acceptance data; expert review | Artifact Intelligence |
| **Artifact Pattern (User-Calibrated)** | Learning Pipeline (from Feedback Events on artifacts of this type) | Artifact Blueprint Assembly | ≥ 2 accepted exemplars; rejection pattern absence | Artifact Intelligence |
| **Artifact Blueprint** | Artifact Intelligence (synthesis from all domain inputs) | Generation System | Conflict resolution rules applied; domain intelligence loaded | Artifact Intelligence |
| **Artifact Exemplar** | Artifact Intelligence (promoted from accepted Artifacts) | Artifact Blueprint Assembly (structural reference) | Acceptance event (no significant edits or rejection) | Artifact Intelligence |
| **Artifact** | Generation System | User (recipient of output); Feedback Event system | User acceptance/edit/rejection response | Artifact Intelligence / Project Intelligence |
| **Goal** | User (explicit); Learning Pipeline (inferred) | Intelligence Profile; Artifact Blueprint (relevance framing); Conflict resolution | Explicit user confirmation; re-validation at time-horizon | User Intelligence (user-scoped) / Project Intelligence (project-scoped) |
| **Constraint** | User (explicit); Workspace admin (compliance) | Artifact Blueprint (exclusion rules); Conflict model | Explicit user statement; demonstrated behavior; admin confirmation | User Intelligence / Project Intelligence / Workspace Intelligence |
| **Preference** | Learning Pipeline (from Feedback Events and editing patterns) | Intelligence Profile; Artifact Blueprint | ≥ 3 consistent non-role-play observations; explicit User confirmation | User Intelligence / Artifact Intelligence |
| **Framework** | Learning Pipeline (from uploaded artifacts and conversational patterns) | Intelligence Profile; Artifact Blueprint (structural and argumentative scaffolding) | Consistent appearance across ≥ 3 distinct contexts | User Intelligence |
| **Knowledge Asset** | User (explicit upload); Workspace admin (shared assets) | Knowledge Intelligence; Artifact Blueprint; Vocabulary Model; Framework registrations | User/admin confirmation; extraction verification | Knowledge Intelligence |
| **Relationship** | Learning Pipeline (from conversation and artifact context); User (explicit description) | Audience Profile; Artifact Blueprint | Second mention + artifact directed at them | Relationship Intelligence |
| **Audience Profile** | Relationship Intelligence (specific); User Intelligence (generic) | Artifact Blueprint (calibration pass); Conflict model | Positive artifact feedback from calibrated artifacts | Relationship Intelligence / User Intelligence |
| **Signal** | All input events (prompts, uploads, feedback, edits, behavioral) | Learning Pipeline (Stage 1) | Quarantine gate (context flags) | Learning Pipeline |
| **Observation** | Learning Pipeline Stage 2 (from validated Signals) | Hypothesis formation | Source quality classification | Learning Pipeline |
| **Hypothesis** | Learning Pipeline Stage 3 (from Observations) | Validation accumulation | Corroboration threshold + contradiction absence | Learning Pipeline |
| **Learning** | Learning Pipeline Stage 5 (promoted Hypothesis) | Intelligence Profile update; domain stores | Validation rules for that stability class | Domain of the Learning's subject |
| **Conflict** | Artifact Blueprint Assembly (detected pre-generation) | Conflict Resolution Model | Resolution rules applied; User notification where required | Cross-Domain (Conflict Resolution Model) |
| **Feedback Event** | User response post-delivery (explicit or behavioral) | Signal extraction; domain update triggers | Event type classification | Artifact Intelligence |

---

## L.3 — Key Contract Principles

| Principle | Implication for Contract Design |
|-----------|-------------------------------|
| **Intelligence, not information** | Extraction contracts must produce validated intelligence, not raw data storage. Every extracted entity must carry a confidence score and source reference. |
| **Domain-scoped consumption** | Consumption contracts must specify which domain's intelligence is being consumed and under what precedence rules. A consumer cannot bypass domain authority boundaries. |
| **Lifecycle-aware production** | Extraction contracts must register the producing entity's stability class and decay schedule at the time of production. Consuming contracts must check lifecycle state before using intelligence. |
| **Conflict transparency** | Any consumption that applies cross-domain intelligence must log the authority precedence applied and surface significant departures to the User per the Transparency Rule. |
| **User correction is sacred** | All contracts must include a user-correction path that immediately supersedes any prior extraction and elevates the corrected entity to Confirmed confidence. |

---

# Final Deliverable Summary

## 1 — BrandOS Logical Intelligence Schema (Summary)

Twenty-four first-class logical intelligence entities govern BrandOS intelligence. They are organized into six intelligence domains. The entities form a complete pipeline from raw input event to compounding artifact quality improvement. Knowledge Intelligence is confirmed as a first-class domain.

## 2 — Entity Relationship Architecture (Summary)

The entity relationship architecture flows from User → Intelligence Profile → Learning, and from User → Project → Artifact. The Artifact is the terminal output that generates Feedback Events, which produce Signals that re-enter the learning pipeline and compound the Intelligence Profile. The complete relationship map is documented in Section C.

## 3 — Domain Ownership Model (Summary)

Six domains: User Intelligence (foundation), Project Intelligence (context), Artifact Intelligence (synthesis and output), Relationship Intelligence (calibration), Workspace Intelligence (organizational standards), Knowledge Intelligence (proprietary IP). Domain ownership is unambiguous: every entity has a primary owner, and cross-domain intelligence flows are governed by inheritance rules and conflict resolution rules. The complete ownership map is in Section F.

## 4 — Signal → Intelligence Pipeline (Summary)

Six stages: Signal Extraction → Observation Formation → Hypothesis Formation → Validation → Learning Creation → Intelligence Profile Update. Each stage has defined gates, confidence handling rules, and escalation conditions. The pipeline is the compounding engine — the only mechanism by which BrandOS improves over time. Full pipeline is in Section D.

## 5 — Intelligence State Machine (Summary)

Ten states: Provisional → Accumulating → Challenged → Validated → Confirmed → Active → Decaying → Flagged → Archived → Retired. State transitions are governed by corroboration, contradiction, time, and explicit User action. Revalidation windows are set by stability class (Permanent / Long-Term / Medium-Term). Full state machine is in Section E.

## 6 — Conflict Resolution Model (Summary)

Three formal structural rules (Scope, Additive, Recipient) and two governance rules (Transparency, Immutability) resolve all domain conflicts. A five-level precedence hierarchy governs authority. Recurring conflicts are escalated to persistent Conflict Records and surfaced to Users for durable resolution. Full conflict model is in Section J.

## 7 — Phase-Based Intelligence Roadmap (Summary)

| Phase | Entities | Capability Unlocked |
|-------|----------|-------------------|
| Phase 1 (GTM) | 9 entity types (simplified lifecycle) | Personalized, contextual, structure-calibrated artifact generation from session 1 |
| Phase 2 | + Relationship, Workspace, Hypothesis formal, Knowledge domain governance, Frameworks, Operating Principles | Named-recipient calibration; team/enterprise contexts; advanced learning pipeline |
| Phase 3 | + Cross-user aggregation, behavioral patterns, emotional register, anticipatory generation, cross-project recognition | Ghost-writing quality; anticipatory intelligence; institutional-scale patterns |

## 8 — Recommendation on Knowledge Intelligence (Summary)

**Knowledge Intelligence is confirmed as a first-class domain.** The ruling is grounded in three irreducible architectural grounds: cross-ownership irreducibility (User + Project + Workspace scope cannot be managed by any single existing domain), lifecycle distinctiveness (the upload → verify → version lifecycle is structurally different from the learning pipeline), and downstream impact (the highest-quality intelligence source deserves first-class architectural governance). Full ruling and schema are in Section I.

---

## Architectural Bridge Confirmation

This document completes the following chain:

```
BrandOS Learning Taxonomy (What BrandOS Learns)
        ↓
BrandOS Intelligence Architecture (How It Is Organized)
        ↓
BrandOS Logical Intelligence Schema [THIS DOCUMENT]
(What entities exist · Their ownership · Their lifecycle ·
 Their relationships · Their state machine · Their conflicts)
        ↓
Intelligence Contracts (Section L — Ready for Extraction)
        ↓
Implementation
```

Every entity, relationship, lifecycle rule, state, and conflict resolution principle in this document is directly derived from and fully consistent with the approved Learning Taxonomy and the approved Intelligence Architecture. No entity has been introduced that is not required by those documents. No entity required by those documents has been omitted.

---

*BrandOS Logical Intelligence Schema · Confidential · Architectural Bridge Document*  
*Derived from: BrandOS Learning Taxonomy v1.0 · BrandOS Intelligence Architecture v1.0*
