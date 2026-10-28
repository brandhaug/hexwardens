# Fog of War

## Purpose & Scope

Per-tribe visibility computation and state projection. Owns `FogSnapshot` (a tribe-scoped snapshot of visible tiles + a pre-validated `FilteredGameState` projection) and the operations a caller can perform with it: ship the projection to that tribe over the wire, commit the visible tiles to that tribe's `exploration` record, or merge an incoming exploration delta. Schema-validates every projected state before returning it.

## Entry Points & Contracts

- `snapshotFor(state, tribe)` → `FogSnapshot` — captures `{ tribe, visibleTileIds: ReadonlySet<TileKey>, projected: Effect Result<FilteredGameState, FogProjectionError> }` at this `(state, tribe)` pair. The projection ships full tile data — including live `unit` / `item` and `unitStates` — for every tile the tribe has currently in sight OR previously explored; never-seen tiles are fully fogged; opponents' `exploration`/`researchInProgress` are stripped. On any schema issue `projected` is `Failure(SchemaViolationError)`.
- `commitExploration(snapshot)` → `GameState` — permanently record the snapshot's visible tiles in that tribe's `exploration` record on the snapshot's source state. Once a tile is in the record, future projections keep that tile fully revealed for that tribe — fog does not return. Idempotent. The snapshot is the only key: a stale-state misuse is impossible because no separate state argument exists.
- `mergeIncomingExploration(state, delta)` → `GameState` — apply an exploration delta `{ tribe, tiles }` (typically emitted from `dispatch`). Preserves locally-explored tiles, only adds keys from `delta.tiles`. Idempotent across replays.

## Key invariants

1. **FogSnapshot is bound to its source state.** Build one per `(state, tribe)` pair. `commitExploration(snapshot)` operates on the snapshot's bound state — there is no separate state argument, so a mutated-state misuse cannot type-check. `visibleTileIds` and `projected` are cached at construction; if you mutate state and re-read these fields you are intentionally reading the pre-mutation visibility.
2. **Projection strips the `seed`.** `FilteredGameState` omits `state.seed` so clients can't predict RNG.
3. **Visibility sources:** owned village ranges and unit sight ranges, read through `GameWorld`. Unit sight includes terrain form, mountain, ranged-tech and flying bonuses. `Board.within` owns geometry.
4. **Schema validation is a hard wall.** `snapshot.projected` returns `Failure(SchemaViolationError)` on any Effect Schema issue — the server logs `fog_projection_failed` and drops the broadcast for that tribe (see `match/logic.ts`).

## Usage Patterns

```ts
// server broadcasting state to one tribe
const projected = snapshotFor(state.gameState, tribe).projected
if (Result.isSuccess(projected)) broadcast.sendToTribe(tribe, { type: 'gameState', state: projected.success, ... })

// dispatch computing newly-seen tiles
const snap = snapshotFor(nextState, tribe)
const newlyExplored = [...snap.visibleTileIds].filter(k => !previous.has(k))
effects.push({ t: 'commitExploration', tribe, tiles: newlyExplored })

// applying a commit-exploration effect
next = mergeIncomingExploration(next, { tribe: effect.tribe, tiles: effect.tiles })

// turn-end exploration commit
state = commitExploration(snapshotFor(state, state.currentPlayerTribe))
```

## Anti-patterns

- **Don't read a stale snapshot's `visibleTileIds` against a mutated state expecting fresh visibility.** The snapshot caches what was visible at construction; reading `visibleTileIds` after a mutation returns the pre-mutation set. Commit is safe (it uses the bound state); reads are not.
- Don't recompute fog client-side. The web app trusts whatever `FilteredGameState` the server ships — see `apps/web/AGENTS.md`. (The board view uses `snapshotFor(filteredState, tribe).visibleTileIds` to decide which tiles to draw, not to filter authoritative data.)
- Don't bypass `snapshotFor(...).projected` to ship a raw `GameState` to a client. It leaks `seed`, opponent unit positions, and opponents' `researchInProgress`.

## Dependencies & Edges

- Consumed by: `../dispatch.ts` and `../action-execution.ts` for exploration deltas, `../match/logic.ts` for per-tribe broadcasts, `../turns/turn-rules.ts`, and `../match/init.ts`.
- Uses: `../board/board.ts`, `../domains/tribe.ts` (village range), `../domains/unit.ts` (explorationRange), `./schema.ts` (Effect Schema), `effect/Result`.

## Patterns & Pitfalls

- `projectPlayerStates` keeps the viewing tribe's full state but strips `exploration` and `researchInProgress` from opponents. Don't expand this to leak more — UI should fetch its own tribe's data, not peek at opponents.
- `computeVisible` re-runs for every `snapshotFor` call. Cache the snapshot when doing multiple reads against the same `(state, tribe)`.

`FogSnapshot.sourceState` binds exploration commits to their original immutable state. The seed is explicitly omitted from the projected wire state. Player records contain only participating tribes.

Visibility and projection read detached tiles, units and players through a private `GameWorld`. Exploration writes use its validated player draft. An empty or already-applied exploration delta returns the original state reference; repeated commits of the same snapshot return its cached committed projection.

`FilteredTileGrid` is deeply readonly, matching authoritative `TileGrid` reads. The schema accepts readonly grid/perk arrays without changing their JSON encoding or validation rules.

Enemy unit states expose `homeVillage: null` even when the unit is visible. Recruitment origins can reveal an unseen city; only the owning viewer may receive that link.
