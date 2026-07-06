# @intelligence-os/core

Intelligence OS — a deterministic user-intelligence layer and artifact-blueprint engine, published as an independently consumable platform SDK.

Given a user's accumulated voice, preferences, project context, and feedback history, Intelligence OS assembles a complete **blueprint** for the next artifact you generate — structure, narrative frame, voice directives, audience calibration, and compliance requirements — and learns from what happens after you publish it. Every extractor and classifier is deterministic, in-process pattern matching; nothing here calls an LLM or an external service.

## Install

```bash
npm install @intelligence-os/core @intelligence-os/shared-types @supabase/supabase-js
```

You provide your own Supabase project running the `intelligence` schema (see `src/db/schema.sql` and `src/db/migrations/`) and pass in a service-role `SupabaseClient`. Intelligence OS never reads environment variables or creates its own client.

## Quick start

```ts
import { IntelligenceOS } from '@intelligence-os/core';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const intelligenceOS = new IntelligenceOS({ supabase });

const blueprint = await intelligenceOS.buildBlueprint({
  userId: 'user-123',
  artifactType: 'board_update',
});

// blueprint.degraded === false, blueprint.confidenceScore is 0–1 —
// always succeeds, even for a brand-new user with no stored intelligence.
```

## Programming against the interface, not the class

If you'd rather depend on an interface than a concrete class — for dependency injection, or to swap in a test double — use `IntelligenceOSProvider`:

```ts
import { IntelligenceOS, IntelligenceOSProvider, type IIntelligenceProvider } from '@intelligence-os/core';

const provider: IIntelligenceProvider = new IntelligenceOSProvider(
  new IntelligenceOS({ supabase }),
);
// or: IntelligenceOSProvider.fromConfig({ supabase })

await provider.buildBlueprint({ userId: 'user-123', artifactType: 'board_update' });
```

`IIntelligenceProvider` is the platform's published contract: `buildBlueprint`, `recordFeedbackEvent`, `ingestKnowledgeAsset`, `upsertProject`, `reviewLearning`, `getBrandSummary`. `IntelligenceOS` itself `implements` this interface directly, so either type works as the injected dependency in your own container — `IntelligenceOSProvider` exists for the cases where you want the interface type explicitly, without exposing `.eventBus`.

## Subscribing to pipeline events

```ts
intelligenceOS.eventBus.on('intelligence.blueprint.built', async (payload) => {
  console.log(`Blueprint built in ${payload.processingMs}ms`);
});
```

See `src/types/events.ts` for the full set of 14 event types and their payload contracts.

## What's exported

| Export | What it's for |
|---|---|
| `IntelligenceOS`, `IntelligenceOSConfig` | The concrete engine |
| `IIntelligenceProvider` | The platform's provider contract (interface) |
| `IntelligenceOSProvider` | Interface-typed adapter over `IntelligenceOS` |
| `InProcessEventBus`, `IntelligenceEventBus` | The default event bus and its interface |
| `IntelligenceOSError`, `PhaseNotImplementedError`, `DomainNotActivatedError`, `EntityNotFoundError`, `ValidationError`, `DatabaseError` | Typed errors, catchable by class |
| `ProjectInput`, `KnowledgeAssetInput` | Input shapes for `upsertProject()` / `ingestKnowledgeAsset()` |

Everything not listed in `src/index.ts` is an internal implementation detail and may change without notice between minor versions — see `docs/EPIC2_PUBLIC_PLATFORM_SURFACE.md` in the source repository for the full, maintained list of what's public vs. internal.

## Versioning policy

Pre-1.0: a breaking change to `IIntelligenceProvider`'s method signatures, to any type in `@intelligence-os/shared-types`, or to an event type/payload contract gets a **minor** version bump and a CHANGELOG entry — never a silent patch release. Purely additive changes (new optional fields, new methods alongside existing ones) are patch or minor at the maintainers' discretion. After 1.0, standard semver applies.

## Building from source

```bash
pnpm install
pnpm -r build       # emits dist/ for both this package and @intelligence-os/shared-types
pnpm -r typecheck
pnpm -r test
pnpm --filter @intelligence-os/core run check:boundaries   # platform boundary rules
```

No `.env`, no live Supabase instance, and no network access are required to typecheck or test — every Supabase call is mocked in the test suite.

## Running the HTTP API locally

This package publishes `createCognitionHttpServer` / `createCognitionRequestHandler`
(see `src/api/http/server.ts`) as pure, injectable functions — it never reads
`process.env` or creates its own Supabase client itself (see "Forbidden
dependencies" in this repo's `AGENT_CONTEXT.md`). Something has to be the
host application that actually wires those functions up to real
infrastructure and calls `.listen()`; that's **`apps/api`**, not this
package.

To run the API locally:

```bash
cd apps/api
cp .env.example .env   # then fill in your own values
pnpm dev
```

See `apps/api/README.md` for the full local-run and deployment story
(including the Vercel-hosted path at `https://intelligence.saurabhtiwariai.com`),
and `docs/architecture/adr/ADR-002.md` for why the apps/api boundary exists
at all instead of a `serve` script living in this package.
