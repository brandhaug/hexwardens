# Player State

## Purpose & Scope

Per-tribe game data and validated player drafts for money, exploration, research and identity. Runtime writes use `GameWorld.editPlayer`, which delegates validation to this module's immutable `editPlayer` helper before replacing the indexed player record. Owns the `PlayerStateError` tagged-error family for unknown tribes, insufficient funds and research conflicts.

## Entry Points & Contracts

- `PlayerStateRecord = Partial<Record<Tribe, PlayerState>>` lives on `GameState.playerStates`. Only participating tribes are present. Use the read helpers and handle missing tribes; never assert that all nine tribes exist.
- `editPlayer(record, tribe, mutator)` → new `PlayerStateRecord`. The validated helper beneath `GameWorld.editPlayer`. The mutator receives a `PlayerDraft` with `spend`, `credit`, `startResearch`, `tickResearchProgress`, `completeResearch`, `exploreTiles`. Each validates synchronously and throws a `PlayerStateError` on violation.
- On throw, `editPlayer` _does not catch_ — the error propagates. Call sites using Result need to wrap. Reason: makes misuse loud in tests, which caught several bugs before ship.
- `getPlayerState` / `getActivePlayerStates` / `getCurrentPlayerState` — read helpers. `getCurrentPlayerState` throws if the tribe is missing (fail-fast on internal invariant), others return `undefined` / filter.

## Usage Patterns

```ts
world.editPlayer(tribe, (p) => {
	p.spend(cost)
	p.exploreTiles(newlySeen)
})
```

## Anti-patterns

- **Never** mutate player state directly (`playerStates[tribe].money -= cost`). Bypasses the `InsufficientFundsError` check; breaks referential-equality-based diffing in `match/logic.ts` (which relies on `state !== before` to decide whether to persist).
- Don't pass `PlayerDraft` out of the mutator closure. It's a live proxy over `current` — using it after `editPlayer` returns has no effect.
- Don't catch `PlayerStateError` inside the mutator to "ignore" a spend failure. If the action can fail gracefully, validate before calling `editPlayer` (e.g. in the action handler's pre-check).

## Dependencies & Edges

- Draft mutations flow through `../engine/world.ts`; actions, turn rules and exploration commits call that world interface. Read helpers serve planners, dispatch and UI queries.
- Uses: `effect/Schema.TaggedError`, `../domains/tech.ts`, `../domains/tribe.ts`, `../difficulty.ts`.

## Patterns & Pitfalls

- `exploreTiles` takes tile-key strings (see `../board/board.ts::positionKey`) and upserts into the `exploration: Record<string, true>` map. The `true`-only value is deliberate — presence is the signal.
- `researchInProgress` is a single slot, not a queue. `startResearch` throws `ResearchAlreadyInProgressError` if one is live. Changing to a queue breaks the research phase in `turns/index.ts` and UI assumptions.

Player getters return `PlayerRead`, a deeply readonly view of `PlayerState`, including research arrays, exploration records, and research progress. Preserve player insertion order through world hydration and projection because it determines turn rotation. Affordability checks require only money; tech requirement checks require only researched techs.

`selectActionableUnits` preserves the registry read view for both unit identity/stats and unit state. It must not widen either back to mutable owner types.
