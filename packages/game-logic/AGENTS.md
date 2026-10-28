# @hexwardens/game-logic

## Purpose & Scope

Platform-independent simulation shared by offline play and authoritative multiplayer. Private indexed maps implement `GameWorld`; a pure command reducer handles match events. Turns use an ordered synchronous loop and bots a bounded async loop. Effect supplies schemas and typed results. `GameState` is the immutable projection consumed by hosts and rendering. Read [engine/AGENTS.md](src/engine/AGENTS.md) before changing storage or command transactions, and [match/AGENTS.md](src/match/AGENTS.md) before changing host persistence or hydration.

## Top-level entry points

- **`dispatch(state, tribe, intent)`** (`src/dispatch.ts`) executes `move | attack | tileAction` against a private `GameWorld` candidate. Enforces game-over, turn ownership, and seals the outcome. Returns executable effects; use `executeCommittedIntent` (`src/action-execution.ts`) unless deliberately deferring exploration commits.
- **`advanceTurn(state, ctx?)`** (`src/turns/index.ts`) runs ten ordered turn rules synchronously. Returns the next projection, broadcast events, chronicle entries, outcome, next tribe, and phase trace. See `src/turns/AGENTS.md`.
- **`resolveCombat(state, attack)`** (`src/combat/resolve.ts`) is the immutable wrapper around `resolveWorldCombat`, which dispatch calls directly. Unit abilities use the shared hook registry. See `src/combat/AGENTS.md`.
- **`createMatchLogic(deps)`** (`src/match/logic.ts`) — match state machine with ports. See `src/match/AGENTS.md`.
- **`snapshotFor(state, tribe)`** (`src/fog-of-war/`) — single-shot per-tribe visibility + pre-validated `FilteredGameState` projection, paired with `commitExploration` and `mergeIncomingExploration` for state mutation. See `src/fog-of-war/AGENTS.md`.

## Subdomains (downlinks)

| Subdir                                      | Role                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`engine/`](src/engine/AGENTS.md)           | Normalized indexed storage, command transactions, and persistence schemas.                   |
| [`actions/`](src/actions/AGENTS.md)         | Tile-action handlers (build, capture, collect, train, research, heal, explore).              |
| [`board/`](src/board/AGENTS.md)             | Hex coordinates, `Board` wrapper, movement, board generation.                                |
| [`combat/`](src/combat/AGENTS.md)           | Sealed `CombatState`, declarative modifier pipeline, `UnitAbility` registry, counter-attack. |
| [`domains/`](src/domains/AGENTS.md)         | Static entity types and stat tables (Unit, Tribe, Tech, Village, ...).                       |
| [`fog-of-war/`](src/fog-of-war/AGENTS.md)   | `FogSnapshot` single-use snapshot + Effect Schema-validated projection.                      |
| [`match/`](src/match/AGENTS.md)             | Pure match state machine, ports, initializer.                                                |
| [`multiplayer/`](src/multiplayer/AGENTS.md) | Wire types and codec for WebSocket messages.                                                 |
| [`player/`](src/player/AGENTS.md)           | `PlayerState` and the `editPlayer` mutator.                                                  |
| [`turns/`](src/turns/AGENTS.md)             | Single Turn Executor with declarative phase registry.                                        |
| [`bot/`](src/bot/AGENTS.md)                 | Single-turn scorer-based bot decision maker.                                                 |
| [`units/`](src/units/AGENTS.md)             | `UnitRegistry` + `trainUnit` / `unitsLow` lifecycle helpers.                                 |
| `tile/`                                     | `TileState`, `TileSelection`, `TileItem` helpers.                                            |
| `validation/`                               | Lightweight runtime assertions for invariants.                                               |

## Cross-cutting invariants (don't duplicate in children)

1. **Immutability.** Public operations never mutate input projections. No-ops may return the same reference; reference equality distinguishes them from committed changes.
2. **Economy writes use `GameWorld.editPlayer`.** Its validated draft retains the player-domain money and research rules. Projected player records are read-only inputs, never a second authoritative store.
3. **Combat uses the shared resolver.** Command execution calls `resolveWorldCombat`; immutable callers use `resolveCombat`. `CombatState` remains a branded sealed input to damage calculation. See `src/combat/AGENTS.md`.
4. **Fog-of-war: snapshots are bound to their source state.** `commitExploration(snapshot)` is single-argument — the snapshot is the only key, so committing against a mutated state cannot type-check. Cached reads (`visibleTileIds`, `projected`) still reflect the construction state. See `src/fog-of-war/AGENTS.md`.
5. **Units have one authoritative location.** World unit records own position, identity and mutable unit data. Projection joins them into `state.units`; runtime gameplay uses world mutations. Immutable registry helpers remain for compatibility construction and fixtures.

## Anti-patterns

- Don't add a barrel `index.ts` at the package root. Consumers import from `@hexwardens/game-logic/<subpath>` (e.g. `@hexwardens/game-logic/dispatch`, `@hexwardens/game-logic/fog-of-war/snapshot`).
- Don't reach past a subdomain's public surface. If a combat modifier needs player tech, go through `getPlayerState`, not through the raw record.
- Don't mix `BoardPosition` (`{q_idx, r_idx}`) with wire coords (`{q, r}`). The codec translates; internal code always uses the former.

## External references

- Multiplayer architecture: Cloudflare Durable Objects + Alchemy IaC, sync-first design — see `apps/game-server/AGENTS.md`.
- Root `AGENTS.md` for monorepo-wide setup and PR rules.
