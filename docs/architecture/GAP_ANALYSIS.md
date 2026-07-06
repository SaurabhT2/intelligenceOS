# IntelligenceOS — Gap Analysis

This is an assessment of whether IntelligenceOS, as it currently exists, is a **self-describing repository** — one where a new engineer or AI agent with access to the repository alone (source code, `foundations/` documents, roadmap, implementation guide) can become fully productive without external context. The short answer: **not yet, but closer than it looks**, and the four deliverables that precede this one close most of the distance. This document records what's still missing, what's actively misleading, and what to do about each.

Findings are grouped by severity and given a stable ID (`G-1`, `G-2`, ...) so they can be referenced from code comments, `AGENT_CONTEXT.md` files, or issue trackers without restating the description each time.

---

## Severity tier 1 — Actively misleading (fix before anything else)

### G-1. The actual code is namespaced for a system that, per this engagement's framing, no longer exists

> **Status: RESOLVED at Epic 2 (Platform Publication).** Both recommendations below were carried out in full: the npm scope is now `@intelligence-os/shared-types` / `@intelligence-os/core` (root workspace: `intelligence-os-workspace`), and all 14 event-type strings now share the `intelligence.*` namespace. There was no live caller to protect, so this shipped as a single pass rather than a deprecation window, exactly as this finding anticipated. See `packages/intelligence-os/CHANGELOG.md` 0.2.0 for the itemized breaking changes and `docs/IMPLEMENTATION_STATUS.md` for the full Epic 2 record. The "Source: BrandOS_X.md" provenance comments referenced in the original recommendation below were intentionally left alone — they're accurate historical citations to the foundations documents, not a contradiction of platform independence, and rewriting them is G-7's lower-priority, do-incrementally scope, not G-1's.

**Finding (as of Epic 1, before the fix above).** 46 of the 64 TypeScript source files in `packages/intelligence-os` reference `BrandOS` or `brandos` in some form — package scope (`@brandos/intelligence-os`, `@brandos/shared-intelligence-types`), root workspace name (`brandos-workspace` in the root `package.json`), header-comment provenance lines ("Source: BrandOS_..."), and, most importantly, **5 of the event bus's 14 runtime event-type string literals are literally `brandos.artifact.feedback`, `brandos.knowledge_asset.uploaded`, `brandos.project.created`, `brandos.project.updated`, and `brandos.user.correction`**. These aren't comments — they're wire-format strings a calling system has to subscribe to by exact match, and they're embedded in the discriminated-union type (`IntelligenceEventType` in `types/events.ts`) that downstream code switches on.

**Why this is tier 1, not cosmetic.** A new engineer told "BrandOS no longer exists, treat this as independent" who then opens `events/IntelligenceEventBus.ts` and sees `bus.on('brandos.artifact.feedback', ...)` has just received contradictory information from their two most trusted sources (this onboarding system vs. the actual running code). That contradiction is worse for trust than no documentation at all, because it teaches the reader to doubt everything else this repository tells them.

**Recommendation (carried out — kept here for the historical record).**
- Rename the npm scope from `@brandos/*` to something IntelligenceOS-native (e.g. `@intelligence-os/shared-types`, `@intelligence-os/core`) and rename the root workspace from `brandos-workspace` to `intelligence-os-workspace`.
- Rename the five event types to a neutral namespace — `artifact.feedback.recorded`, `knowledge_asset.uploaded`, `project.created`, `project.updated`, `user.correction.received` (or similar; the exact names matter less than removing the foreign-system prefix). This is a breaking change for any existing caller, so it should ship as a single, clearly-flagged migration commit with both old and new event names supported for one deprecation window if there's a real existing caller to protect — but if there is no real existing caller yet (and per this engagement's framing, there should be none), do it now, in one pass, rather than later as a breaking change against real integrations.
- Replace "Source: BrandOS_X.md, Section Y" provenance comments with either nothing, or a pointer to the relevant section of `INTELLIGENCEOS_BOOTSTRAP.md` / the relevant `AGENT_CONTEXT.md` — see G-7.
- This is mechanical, low-risk, high-value work — a good candidate for a single dedicated PR, and a good first task for whoever onboards next, precisely because doing it requires reading enough of the codebase to find every instance.

### G-2. Four pipeline classes bypass the domain-ownership boundary they're supposed to respect

**Finding.** `pipeline/HypothesisEngine.ts`, `pipeline/LearningValidator.ts`, and `pipeline/ProfileBuilder.ts` each hold their own `SupabaseClient` (injected via constructor) and write directly to `intelligence.hypotheses`, `intelligence.learnings`, and `intelligence.profiles` respectively — even though `UserIntelligenceDomain` defines `insertLearning()` and `upsertProfile()` for exactly this purpose and is the documented sole owner of those tables. `knowledge/KnowledgeProcessor.ts` does the same against `intelligence.knowledge_assets` in its private `persistAsset()` method, bypassing `KnowledgeIntelligenceDomain` even though that domain's own header docblock anticipates a `persistExtracted()` method by name that doesn't yet exist.

**Why this is tier 1, not a minor cleanup.** This is the single rule the repository states most emphatically (it's Architectural Rule 1 in the Bootstrap, and it's stated in multiple files' own header comments) — and it's already broken in four places, in the *current* sprint's code, not in some abandoned experiment. A new engineer who internalizes "one domain, one writer" from reading `UserIntelligenceDomain.ts` and then opens `HypothesisEngine.ts` will either (a) conclude the rule is aspirational and not really enforced, which erodes the value of every other stated rule, or (b) miss the violation entirely and write a fifth instance of the same pattern the next time they need to persist something from inside a pipeline.

**Recommendation.**
- Add `UserIntelligenceDomain.insertLearning()` and `.upsertProfile()` as the actual call sites `HypothesisEngine` and related classes use — both methods already exist on the domain, just unused by their intended callers. This is the smallest possible fix and should be done first.
- Add a `persistExtracted()` method to `KnowledgeIntelligenceDomain` (the name `KnowledgeProcessor.ts`'s own docblock already proposes) and route `persistAsset()` through it.
- For `HypothesisEngine`'s and `LearningValidator`'s read-only corroboration-check queries against `intelligence.hypotheses` and `intelligence.learnings` (not just the writes), evaluate whether those tables need their own thin read methods on `UserIntelligenceDomain`, or whether `intelligence.hypotheses` should get a dedicated owning domain method set of its own — the current code doesn't cleanly fit "hypotheses are owned by UserIntelligenceDomain" without that domain also picking up the in-progress, not-yet-validated parts of the model, which is a real design question, not just a refactor.
- Once fixed, this becomes the flagship example in `domain_boundary_audit.generated.json` (Repository Context Strategy) of the CI gate actually catching something — verify the gate fires on the *current* code before merging the fix, as a sanity check that the generator works.

### G-3. There is no `README.md` anywhere in the repository

> **Status: RESOLVED at Epic 2 (Platform Publication).** A root `README.md` pointing at the bootstrap, plus a `README.md` for each package, now exist — exactly per the recommendation below, done as part of "package publication readiness" work (an unpublished package with no README is dead on arrival on a real registry). See `docs/IMPLEMENTATION_STATUS.md` for the full Epic 2 record.

**Finding (as of before the fix above).** Confirmed by direct search: zero `README.md`, `README.txt`, or equivalent files exist at the workspace root or in either package. The only document a person lands on after cloning the repository, before this engagement's deliverables existed, is whatever they happen to open first.

**Recommendation.** Add a minimal root `README.md` whose entire job is to point at `INTELLIGENCEOS_BOOTSTRAP.md` and say, in one paragraph, "start there." Do not duplicate the bootstrap's content into the README — a `README.md` that's a thin pointer is much less likely to drift out of sync than one that tries to restate the mission/architecture inline. Each package (`packages/intelligence-os/`, `packages/shared-intelligence-types/`) should similarly get a one-paragraph `README.md` pointing at its own `AGENT_CONTEXT.md`.

---

## Severity tier 2 — Real gaps that block full self-description, but don't actively mislead

### G-4. Coverage thresholds and several `AGENT_CONTEXT.md`-documented test gaps are stale

**Finding.** `vitest.config.ts`'s coverage thresholds (`lines: 40, branches: 30`) are explicitly commented as "low threshold for Sprint 0 (mostly stubs)" — but the codebase is now three sprints past that, with two full pipelines (Learning, Blueprint) and a third (Knowledge) shipped since. Separately, `HypothesisEngine`, `LearningValidator`, and `ProfileBuilder` have no dedicated unit test files and are exercised only indirectly via `pipeline-integration.test.ts`; `ProjectContextBuilder` has no dedicated unit test and is exercised only via `tests/integration/blueprint.test.ts`.

**Recommendation.** Raise the coverage threshold to reflect the codebase's actual current maturity (a reasonable target, once G-4's missing unit tests below are added, is in the 70–80% line range given how much of this codebase is deterministic, side-effect-isolated logic that's cheap to test thoroughly) and add the three missing pipeline unit-test files plus the one missing blueprint unit-test file. `test_coverage_map.generated.md` (Repository Context Strategy) is designed specifically to make gaps like this mechanically visible going forward instead of requiring someone to notice by reading the test directory tree.

### G-5. `db/queries/` exists, is referenced in the Bootstrap's structure listing, and contains nothing

**Finding.** Six empty placeholder files sit in `packages/intelligence-os/src/db/queries/`, explicitly excluded from coverage requirements in `vitest.config.ts` with the comment "stub files, no coverage needed in Sprint 0." Nothing imports from this directory. It's unclear from the code alone whether this directory represents (a) a deliberate, still-relevant plan to extract query-builder logic out of the domain classes once they grow complex enough, or (b) a leftover scaffold from early planning that should simply be deleted.

**Recommendation.** This is a real decision the team needs to make, not something to resolve unilaterally in documentation. Two reasonable paths: delete the directory now and let it be recreated if and when a domain class's inline query logic genuinely grows complex enough to warrant extraction (simpler, and consistent with the "smallest implementation that satisfies the contract" philosophy already visible elsewhere in this codebase); or keep it and write one concrete example extraction (e.g., move `UserIntelligenceDomain.getActiveLearnings()`'s query-building logic into `queries/learnings.ts`) so the pattern is demonstrated rather than left as six empty files with no precedent. Either way, `db/AGENT_CONTEXT.md` should be updated to reflect whichever decision is made — it currently (correctly) flags this as unresolved.

### G-6. `RelationshipIntelligenceDomain`'s activation trigger is unverifiable from the code alone

**Finding.** The domain's docblock states it activates when "≥3 external artifacts with named recipients exist, OR an explicit trigger from user onboarding signals the need" — but no code anywhere in the repository checks this condition. There's no scheduled job, no method on any domain, and no pipeline stage that counts external artifacts with named recipients and flips a switch. The trigger condition is documented as a fact about the system's intended behavior, but isn't currently implemented as actual behavior.

**Recommendation.** Either implement the trigger-check (a method, likely on `ArtifactIntelligenceDomain` since it owns `feedback_events`/`artifact_blueprints`, that can answer "has user X crossed the named-recipient threshold") and wire it somewhere a real system would call it (perhaps as a periodic check, or inline during blueprint assembly when a named audience reference is present), or change the docblock to say "documented future activation criterion, not yet automatically checked" so the gap between *documented intent* and *actual behavior* is itself documented rather than implied to already exist.

### G-7. The provenance-comment convention ("Source: BrandOS_X.md, Section Y") will rot

**Finding.** Nearly every source file's header docblock includes a line like `Source: BrandOS_IntelligenceOS_Architecture.md, Section 2.1`. This is presently useful — it lets a reader trace a design decision back to its specification — but it's also the convention most likely to silently go stale, because nothing checks that the referenced document, section, or even document set still exists or is still considered authoritative. (This very engagement is a case in point: it explicitly asks future engineers to *not* treat the BrandOS-prefixed planning documents as load-bearing reference material going forward.)

**Recommendation.** Going forward, replace `Source: <planning-doc>, Section Y` with `Rule: <one-line statement of the rule itself>` plus, where genuinely useful, `See: AGENT_CONTEXT.md` or `See: INTELLIGENCEOS_BOOTSTRAP.md §N`. The rule should be restated in the comment, not just pointed at — a comment that says what the rule *is* survives the eventual deprecation of whatever document originally motivated it; a comment that only points at a document doesn't. This is a large, low-urgency cleanup (dozens of files) — a good candidate for doing incrementally, file-by-file, as each file is touched for an unrelated reason, rather than a dedicated sweep.

### G-8. No root-level `tsconfig.json`, lint configuration, or CI definition exists

**Finding.** Confirmed by direct search: no `tsconfig.base.json` or root `tsconfig.json` (each package has its own, fully independent one, with no shared base to keep `compilerOptions` in sync), no `.eslintrc*` or equivalent, no `.github/workflows/` or other CI configuration, no `.gitignore`, no `.env.example`.

**Recommendation.**
- Add a shared root `tsconfig.base.json` that both packages' `tsconfig.json` files `extend`, to prevent the two packages' compiler strictness settings from silently drifting apart (they currently happen to match, but nothing enforces that).
- Add lint configuration (ESLint or equivalent) with at minimum a rule that would catch G-2-style violations going forward — an import-boundary lint rule (e.g. via `eslint-plugin-boundaries` or a custom rule) that forbids `pipeline/` and `knowledge/` files from importing `@supabase/supabase-js` directly would have caught this class of issue automatically rather than requiring this gap analysis to find it by manual inspection. This is plausibly the single highest-leverage tooling investment available given G-2's findings.
- Add a CI workflow that runs `pnpm typecheck`, `pnpm test`, the `domain_boundary_audit.generated.json` staleness check, and the new lint rule on every PR.
- Add a `.env.example` documenting the one piece of runtime configuration the package genuinely needs from its environment when deployed (even though the package itself never reads `process.env` directly — see `intelligence-os/AGENT_CONTEXT.md`'s Forbidden Dependencies — the calling system that constructs `IntelligenceOSConfig` does need to know what Supabase URL/service-role-key shape to provide).

---

## Severity tier 3 — Worth tracking, not urgent

### G-9. No formal versioning or changelog convention for the `ArtifactBlueprint`/`ArtifactRequest`/`FeedbackEvent` contract

> **Status: RESOLVED at Epic 2 (Platform Publication).** Both packages now carry a `CHANGELOG.md` and ship at `0.2.0`; `@intelligence-os/core`'s README states the versioning policy explicitly ("a breaking change... gets a minor version bump and a CHANGELOG entry — never a silent patch release"). Note this package is no longer `private: true` either — see `docs/IMPLEMENTATION_STATUS.md`, "Package publication readiness," for why that matters beyond just this gap.

**Finding (as of before the fix above).** `shared-intelligence-types` is at `0.1.0` and has no `CHANGELOG.md`. Given this package defines the cross-system integration boundary (per its own `AGENT_CONTEXT.md`, the single highest-blast-radius package in the repository), a breaking change to any exported type currently has no mechanism forcing it to be flagged as such beyond a contributor's own diligence.

**Recommendation.** Adopt semantic versioning for this package specifically (even though it's `private: true` and not published to a registry) and require a `CHANGELOG.md` entry for any change to an exported type's shape. This is low-cost and pays for itself the first time someone needs to know whether upgrading their pinned version of this package is safe.

### G-10. The five universal artifact patterns seeded in `schema.sql` are not documented anywhere outside the SQL comments themselves

**Finding.** `schema.sql`'s seed data defines five `artifact_patterns` rows for `pattern_level = 'universal'` — these are the actual fallback structures `StructurePlanner` resolves to for a brand-new user with no calibration. Their content (what sections, what depth) is real, load-bearing default behavior, but it's only visible by reading raw seed SQL, not summarized anywhere a new engineer would naturally look first.

**Recommendation.** A short table in `blueprint/AGENT_CONTEXT.md` (or a new `repository_context.generated.md` section, since this is mechanically extractable from the seed `INSERT` statements) listing the five universal patterns and their section structures at a glance would save a meaningful amount of "let me go read raw SQL to understand default behavior" time.

### G-11. The historical relationship to BrandOS, while now de-emphasized per this engagement's framing, still has real implications that are easy to lose track of entirely

> **Status: this is exactly what happened at Epic 2, and it went the way this finding hoped.** The public API surface *did* need to evolve for a genuinely new need (independent platform publication) — Epic 2 added `IIntelligenceProvider` and `IntelligenceOSProvider` rather than quietly routing around the four-method surface or silently coupling to a new consumer's shape. The decision is recorded with its reasoning in `docs/IMPLEMENTATION_STATUS.md` and in `IIntelligenceProvider.ts`'s own docblock, in the spirit this finding recommended — institutional history consulted, decision made deliberately, reasoning kept legible for whoever reads it next. Treat this status note itself as the next link in that chain, not a replacement for it.

**Finding.** In aggressively removing BrandOS framing from onboarding material (correctly, per this engagement's instructions), there's a risk of also losing the genuinely useful information that *some* of this system's design constraints exist because of a real external integration shape — for instance, the entire reason the public API surface is exactly four methods plus an event-bus accessor, described as "fixed for all sprints" in `IntelligenceOS.ts`, traces back to a deliberate integration-boundary decision made with a specific calling system's shape in mind, not an arbitrary design preference.

**Recommendation.** Where this Bootstrap or an `AGENT_CONTEXT.md` states a rule as "this is how it is," that's deliberately treated as sufficient — future engineers don't need the historical *why* to follow the rule correctly. But if and when IntelligenceOS needs to evolve its public API surface for a genuinely new calling system with different needs, whoever makes that call should know enough institutional history to recognize "this surface was shaped by one specific prior integration" as a fact worth re-examining rather than a constraint to route around quietly. A single short paragraph (already present in this engagement's Bootstrap, §2, "A note on history") is sufficient for this — resist the temptation to either delete it entirely or expand it into a full history section.

---

## Summary verdict

**Is IntelligenceOS currently self-describing?** No — primarily because of G-1 (contradictory naming) and G-2 (a stated rule with known, current violations), both of which actively undermine trust in the documentation that does exist, and secondarily because of G-3/G-8 (the complete absence of the baseline files — README, lint config, CI — that most engineers expect to find before they even start reading).

**Does it have the bones of a self-describing repository?** Yes, more than the gaps above might suggest. The thing that makes this repository tractable to onboard into — and what made writing the Bootstrap, the `AGENT_CONTEXT.md` files, and this Gap Analysis possible *from the source code and the supplied documents alone* — is that almost every file already carries a docblock stating its responsibility and its real-vs-stubbed status, the domain/pipeline boundaries are consistently (if not perfectly) respected, and the test suite's mocked-everything design means the system's behavior is genuinely verifiable without external setup. The schema's own self-correcting RLS-policy comment (`schema.sql`, line ~469: the implementation caught and fixed a bug in the original architecture spec's policy, and left a comment explaining exactly what was wrong and why) is a good example of the documentation habit this codebase already has at its best — the work in this engagement is mostly about generalizing that habit consistently, removing the contradictions, and giving it a place to live (the Bootstrap, the `AGENT_CONTEXT.md` files, and the generated context artifacts) that doesn't depend on a planning document that the project has now moved beyond.

**Priority order for closing the remaining gaps:** G-1 and G-2 first (both are mechanical, bounded, and actively undermine everything else); G-3 and G-8 next (cheap, standard hygiene, high first-impression value); G-4 through G-7 as ongoing maintenance once the above land; G-9 through G-11 as lower-urgency process improvements.
