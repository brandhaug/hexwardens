# Board

## Purpose & Scope

Hex-grid coordinate system, tile access, neighbor/distance math, movement resolution, and map generation. Owns the `BoardPosition` public shape and hides all array-index / cube-coord / honeycomb-grid internals behind the `Board` class.

## Entry Points & Contracts

- `BoardPosition = { readonly q_idx: number; readonly r_idx: number }` (`board.ts`) — **axial array indices**, not cube coordinates. Everything external uses this shape; `Board` translates to honeycomb-grid internally.
- `positionKey(pos)` → `"q_idx,r_idx"`. Canonical tile id used by fog-of-war, exploration records, and anywhere a `Map<tile>` / `Set<tile>` is needed.
- `Board.from(tiles)` constructs a wrapper; `Board.at/contains/key/within/neighborsOf` are the only sanctioned ways to walk the grid.
- `executeMovement(state, from, to)` in `units/world-movement.ts` is the immutable compatibility wrapper. `dispatch` calls that module's `moveWorldUnit` against its candidate world; both use the same range, readiness and movement-mode rules. Board geometry and legality stay independent of command execution.
- `generateBoard(...)` — deterministic board creation driven by a seeded `Prando` rng. Reserve distinct capitals before other placements. Sizes stay fixed. `map-capacity.ts` caps small/medium/large maps at 3/4/5 players; initialization rejects overcrowded setups. Seeded packing retries within the same board. Neutral villages remain at least 4 hexes from every village.
- `starting-territories.ts` guarantees the complete configured starting roster, matching capital population, and two adjacent research-free wheat plots per capital. Ambient placements must preserve these units and resources.
- `unit-placement.ts` holds `assertBoardUnitStatesConsistency`, used when importing and decoding world projections.

## Usage Patterns

```ts
const board = Board.from(state.units.board)
const tile = board.at({ q_idx, r_idx })
for (const n of board.neighborsOf(pos)) {
	/* ... */
}
const distance = board.distance(a, b) // delegates to honeycomb-grid Grid
```

## Anti-patterns

- Don't index `state.units.board[r][q]` at call sites. Use `Board.at` — array shape is `[r_idx][q_idx]` (row-major) and easy to flip by mistake.
- Don't construct `honeycomb-grid` `Hex` or `Grid` directly outside this directory. All hex math lives here; combat/fog-of-war accept a `gameHex` + `radius` instead.
- Don't bake tile coordinates into non-positional state — always key by `positionKey`.
- Don't use lodash `shuffle`/`sample`/`sampleSize` (or any `Math.random`-backed source) in board generation — they silently break the same-seed-same-board invariant (`generateBoard.test.ts` pins it). Use the seeded `shuffleWithRng`/`sampleWithRng`/`sampleSizeWithRng` helpers in `generate-board.ts` and thread the `Prando` rng through.

## Dependencies & Edges

- Consumed by: `../dispatch.ts`, `../combat/`, `../fog-of-war/`, `../actions/features/*`, `apps/web` (for rendering and input), `apps/game-server` (indirectly, via dispatch).
- Uses: `honeycomb-grid` (via `hex-utils.ts` `GameHex = defineHex({ dimensions: GAME_CONFIG.TILE_SIZE })`), `../config.ts` (tile size).

## Patterns & Pitfalls

- Board size must be **odd** — `Board.from` computes `radius = (size - 1) / 2`. Callers generating boards must respect this or `within`/`distance` will produce wrong results.
- Axial indices have `q_idx - radius` / `r_idx - radius` offsets when translating to cube coordinates (`combat/range.ts::hexDistance`). If you write new hex math, copy that translation verbatim rather than guessing.

`TileGrid` is a deeply readonly projection, including rows, tiles, village perks, and unit stats. `Board.tiles`, `at`, and `entries` share that view without cloning. Generation creates geometry first, then `generation-world.ts` supplies normalized world storage for placements. Runtime writes use `GameWorld`; `updateTile` and `Board.update` remain immutable projection helpers. Preserve row-major iteration and seeded RNG call order when changing generation. Movement legality accepts only readonly units, player states, and the current tribe; its budget helper needs only player states beyond its explicit board and unit arguments.

Movement reachability explores least-cost states, including terrain-crossing history. A more expensive route to the same coordinate must not suppress a cheaper legal continuation. Existing terrain crossing and occupancy rules remain unchanged.
