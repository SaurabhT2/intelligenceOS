# AGENT_CONTEXT.md — `packages/intelligence-os/src/compat`

## Purpose

Epic 2 (Platform Publication). The platform's own implementation of `IIntelligenceProvider` — a thin adapter that lets a consumer depend on an interface instead of the concrete `IntelligenceOS` class. This directory exists because consumers swap implementations behind dependency injection; it should stay small and stay an adapter, not grow business logic of its own.

## Responsibilities

- `IntelligenceOSProvider` — wraps an `IntelligenceOS` instance and exposes it as `IIntelligenceProvider`. Every method is a one-line delegation. No retries, no caching, no extra validation, no behavior IntelligenceOS itself doesn't already have — if you find yourself adding any of those here, they belong in `IntelligenceOS`/`BlueprintBuilder` instead, not in the adapter.
- `IntelligenceOSProvider.fromConfig()` — convenience factory for a consumer that only ever needs the interface-typed surface and doesn't otherwise need direct access to the concrete `IntelligenceOS` instance.
- `.underlying` — escape hatch back to the concrete `IntelligenceOS` instance, for the one thing deliberately excluded from `IIntelligenceProvider`: `.eventBus`.

## Allowed dependencies

- `../IntelligenceOS` (the class being wrapped)
- `../IIntelligenceProvider` (the interface being implemented)
- `../types/domains` (`ProjectInput`, `KnowledgeAssetInput` — input types passed straight through)
- `@intelligence-os/shared-types` (`ArtifactRequest`, `ArtifactBlueprint`, `FeedbackEvent`, `IntelligenceSummary`)

## Forbidden dependencies

- **No consumer package of any kind.** RULE-IOS-ISOLATION (see `../../scripts/check-boundaries.mjs`) applies here exactly as it does everywhere else in this package — this directory is not a special integration seam that gets to break the rule, even though "compat" might suggest otherwise. There is no consumer source this platform depends on, full stop.
- No new Supabase access. This adapter must never construct its own domain queries — everything goes through the wrapped `IntelligenceOS` instance.

## Public interfaces

```ts
class IntelligenceOSProvider implements IIntelligenceProvider {
  constructor(intelligenceOS: IntelligenceOS);
  static fromConfig(config: IntelligenceOSConfig): IntelligenceOSProvider;
  get underlying(): IntelligenceOS;
  // ...then every IIntelligenceProvider method, each delegating 1:1.
}
```

## Common implementation mistakes

- **Adding a method to `IntelligenceOSProvider` that isn't on `IIntelligenceProvider`.** If a consumer needs it, either it belongs on the interface (update `../IIntelligenceProvider.ts` deliberately, as a versioned contract change) or it belongs behind `.underlying` (the concrete-class escape hatch), not bolted onto the adapter as a one-off.
- **Letting this adapter diverge from `IntelligenceOS`'s real signatures.** It won't compile if it does — `IntelligenceOS implements IIntelligenceProvider` directly (see `IntelligenceOS.ts`), so any drift between the two is a compile error before it ever reaches this file. Don't suppress that error; fix the interface or the class, deliberately, with a CHANGELOG entry.
- **Constructing a second `IntelligenceOS` instance for convenience.** `fromConfig()` exists for exactly that need — don't duplicate it inline elsewhere.

## Testing expectations

- One delegation test per `IIntelligenceProvider` method: same arguments in, same return value out, verified with a spy on the wrapped `IntelligenceOS` instance (not a fresh mock — spying on the real instance is what actually proves delegation rather than reimplementation).
- A construction test for both paths (`new IntelligenceOSProvider(instance)` and `IntelligenceOSProvider.fromConfig(config)`).
- A type-level assertion that both `IntelligenceOSProvider` and `IntelligenceOS` are assignable to `IIntelligenceProvider` — cheap insurance against silent interface drift.
