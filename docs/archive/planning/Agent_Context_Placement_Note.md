# IntelligenceOS — AGENT_CONTEXT.md Placement &amp; Rationale

This document accompanies the eight `AGENT_CONTEXT.md` files in this deliverable. It explains which directories got one, which didn't, where each file should actually live in the repository, and how they relate to `INTELLIGENCEOS_BOOTSTRAP.md`.

## Where these files go

Each `AGENT_CONTEXT.md` below should be placed at the root of the directory it describes, not collected in one folder:

| This deliverable's file | Lives at (in the actual repo) |
|---|---|
| `shared-intelligence-types/AGENT_CONTEXT.md` | `packages/shared-intelligence-types/AGENT_CONTEXT.md` |
| `intelligence-os/AGENT_CONTEXT.md` | `packages/intelligence-os/AGENT_CONTEXT.md` |
| `intelligence-os-domains/AGENT_CONTEXT.md` | `packages/intelligence-os/src/domains/AGENT_CONTEXT.md` |
| `intelligence-os-pipeline/AGENT_CONTEXT.md` | `packages/intelligence-os/src/pipeline/AGENT_CONTEXT.md` |
| `intelligence-os-blueprint/AGENT_CONTEXT.md` | `packages/intelligence-os/src/blueprint/AGENT_CONTEXT.md` |
| `intelligence-os-knowledge/AGENT_CONTEXT.md` | `packages/intelligence-os/src/knowledge/AGENT_CONTEXT.md` |
| `intelligence-os-events/AGENT_CONTEXT.md` | `packages/intelligence-os/src/events/AGENT_CONTEXT.md` |
| `intelligence-os-db/AGENT_CONTEXT.md` | `packages/intelligence-os/src/db/AGENT_CONTEXT.md` |
| `intelligence-os-compat/AGENT_CONTEXT.md` (added Epic 2) | `packages/intelligence-os/src/compat/AGENT_CONTEXT.md` |

This deliverable groups them in flat folders only because they're being delivered together for review; in the actual repository they belong next to the code they describe, exactly like a `README.md` would.

## Why these eight, and not one per file or one for the whole repo

The rule applied: **a directory gets an `AGENT_CONTEXT.md` if it is (a) a bounded ownership unit with its own dependency rules, and (b) large or sensitive enough that a contributor working inside it needs boundary rules beyond what the bootstrap's prose already covers.**

Both package roots qualify — they're the two units `pnpm` itself treats as packages, each with its own `package.json` and dependency graph. Below `intelligence-os`, the original six subdirectories (`domains`, `pipeline`, `blueprint`, `knowledge`, `events`, `db`) are exactly the bounded sub-areas described in the Bootstrap's Package Responsibilities section, each with distinct, non-overlapping dependency rules (most importantly: which of them are forbidden from touching Supabase directly, and which legitimately need to). A seventh, `compat/`, was added at Epic 2 (Platform Publication) — it holds `IntelligenceOSProvider`, the platform's own `IIntelligenceProvider` adapter, and qualifies for exactly the same two reasons: a bounded ownership unit (it must never depend on a consumer's package — the platform's single most consumer-facing boundary) and large/sensitive enough to need that stated explicitly rather than left to inference. `types/` was deliberately **not** given its own file — it has no behavior and no dependency rules beyond "stay a pure type-definitions directory," which the package-root `AGENT_CONTEXT.md` already states in one line.

This produces a depth-2 pattern: package-level files for the two `pnpm` packages, and sub-area files for the six bounded engine areas beneath `intelligence-os`. Going to depth 3 (a file per individual class — e.g., `BlueprintBuilder.ts` getting its own context file) was considered and rejected: at the current repository size, the per-file docblock convention already established throughout the codebase (what's real, what's deferred, what it's responsible for) does that job at the right grain. An `AGENT_CONTEXT.md` per individual file would mostly restate the docblock in a second location, creating exactly the kind of duplicate-source-of-truth problem the Repository Context Strategy is designed to avoid.

## How these relate to the Bootstrap and to the generated context artifacts

Three layers, three different jobs, deliberately not overlapping:

1. **`INTELLIGENCEOS_BOOTSTRAP.md`** — the *why* and the *whole-system* shape. Read once, fully, before writing any code.
2. **`AGENT_CONTEXT.md` (this deliverable)** — the *boundary rules and current pitfalls* for one specific area, read immediately before working in that area. These files are hand-maintained because "what's a common mistake here" and "what's forbidden and why" are judgment calls, not mechanically derivable facts.
3. **`.context/*.generated.md` and `.generated.json`** (Repository Context Strategy deliverable) — the *current exact facts* (file lists, real-vs-stub status, table ownership, coverage), regenerated automatically so they never drift the way 1 and 2 can.

A consequence of this split worth being explicit about: **every `AGENT_CONTEXT.md` here references the known architectural violation in Gap Analysis G-2** (direct table writes bypassing `UserIntelligenceDomain` and `KnowledgeIntelligenceDomain`) from the vantage point of the directory it's in — `domains/`'s file states it as "here's the rule this violates," `pipeline/`'s and `knowledge/`'s files state it as "here's where the violation lives in this directory, don't add a sixth instance." This repetition is intentional, not an editing oversight: a contributor reading only `pipeline/AGENT_CONTEXT.md` while fixing a bug in `HypothesisEngine.ts` should not need to have also read `domains/AGENT_CONTEXT.md` to know this is a known issue rather than an invitation to copy the pattern.

## Maintenance expectation

Unlike the generated artifacts, these files are reviewed and updated by a human (or an agent under human review) whenever:
- A class moves between directories, or a new class is added to one of these six sub-areas.
- A "stub" listed in one of these files' Responsibilities tables gets implemented (update the table; don't leave it claiming a method is a stub once it isn't — this is the same discipline already expected of the per-file docblocks, applied one level up).
- A "common implementation mistake" listed here gets fixed at the architectural level (e.g., if G-2's direct-write violation is ever resolved, every file currently warning about it should be updated in the same PR that fixes the violation, not left as a stale warning about a problem that no longer exists).
