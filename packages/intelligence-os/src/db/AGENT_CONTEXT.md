# AGENT_CONTEXT.md — `packages/intelligence-os/src/db`

## Purpose

The single source of truth for IntelligenceOS's Postgres schema, and a placeholder location for query-builder extraction that hasn't been needed yet.

## Responsibilities

- `schema.sql` — defines all 13 tables under the `intelligence` Postgres schema (never `public`), row-level security policies, and seed data for the five universal artifact patterns. This file is hand-maintained and authoritative; `domain_boundary_audit.generated.json` (see Repository Context Strategy) is generated *from* the table names referenced here plus the actual call sites in `domains/`, not the other way around.
- `queries/` — six currently-empty placeholder files, evidently intended for query-builder logic to be extracted into once a domain's inline Supabase query chains grow complex enough to warrant it. As of this writing, no domain has reached that point, and nothing imports from this directory. See Gap Analysis G-3 for whether this directory should exist in its current empty form at all.

## Allowed dependencies

- `schema.sql` is plain SQL — no dependencies.
- `queries/` (once populated) should depend only on `@supabase/supabase-js` and the entity/domain types from `../types/`, mirroring what the domain classes themselves currently depend on.

## Forbidden dependencies

- `schema.sql` must never reference the `public` schema for any `intelligence` concern, and must never grant default table access — every grant in this file is scoped explicitly to the `intelligence` schema and the service role.
- If `queries/` is ever populated, query-builder files here must not import from `domains/`, `pipeline/`, `blueprint/`, or `knowledge/` — dependency direction would be domains depending on `db/queries/`, never the reverse, mirroring how domains currently depend on `@supabase/supabase-js` directly.

## Public interfaces

`schema.sql` is not a TypeScript interface, but its table list is the de facto contract every domain class's row-mapping function depends on:

```
intelligence.profiles            — UserIntelligenceDomain
intelligence.learnings           — UserIntelligenceDomain
intelligence.archetypes          — UserIntelligenceDomain
intelligence.audience_profiles   — UserIntelligenceDomain (generic rows) / RelationshipIntelligenceDomain (named rows, Phase 2)
intelligence.projects            — ProjectIntelligenceDomain
intelligence.artifact_patterns   — ArtifactIntelligenceDomain
intelligence.artifact_exemplars  — ArtifactIntelligenceDomain
intelligence.feedback_events     — ArtifactIntelligenceDomain
intelligence.artifact_blueprints — ArtifactIntelligenceDomain
intelligence.knowledge_assets    — KnowledgeIntelligenceDomain
intelligence.relationships       — RelationshipIntelligenceDomain (Phase 2)
intelligence.signals             — defined, currently unused (SignalExtractor keeps Signals in-memory — see Bootstrap §7)
intelligence.hypotheses          — defined; currently written to directly by pipeline/HypothesisEngine.ts rather than through a domain (Gap Analysis G-2)
```

(Exact table list and columns should be read from `schema.sql` directly — this list is a navigation aid, not a substitute for the file.)

## Common implementation mistakes

- **Changing a table's shape in `schema.sql` without checking every domain's row-mapping function.** Every domain file defines a private `XRow` interface and a `mapToX()` function matching the current schema column-for-column. A schema change that isn't mirrored there will fail at runtime, not at typecheck time, since the row interfaces aren't generated from the schema.
- **Adding a new table without deciding its owning domain first.** Every table in this schema should have exactly one domain class as its documented owner before the migration is written — adding a table "to be sorted out later" is how the current `intelligence.hypotheses`/`intelligence.knowledge_assets` direct-write situations happened.
- **Populating `queries/` with a generic, unscoped query builder** "for reuse across domains." If query-builder extraction happens, each file should belong to exactly one domain's tables, mirroring the one-domain-one-owner rule — a shared cross-domain query builder would undermine the same boundary `domains/` exists to enforce.

## Testing expectations

- `schema.sql` itself has no direct test in this codebase (the test suite never touches a live database — see Bootstrap §13). Its correctness is verified indirectly: every domain's mocked-Supabase tests assume a row shape that should match this file, so a schema/domain mismatch will usually surface as a domain test needing an update.
- If a CI step is added to apply `schema.sql` against a real ephemeral Postgres instance for migration-correctness checking, it should remain separate from the main `pnpm test` run — the zero-setup, no-live-database property of the existing test suite is valuable and shouldn't be entangled with schema-migration verification.
