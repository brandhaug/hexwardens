# Units (registry)

## Purpose & Scope

`UnitRegistry` pairs the projected board with `unitStates` for hosts, UI reads and compatibility construction. Runtime unit lifecycle writes use `GameWorld`. Its unit records own identity, position and state; board occupants are joined during projection. Read `../engine/AGENTS.md` when changing storage or lifecycle writes.

## Entry Points & Contracts

- `UnitRegistry = { readonly board: TileGrid; readonly unitStates: UnitStateRecord }` — declared in `../game.ts` (re-exported here to avoid a cycle), so `GameState.units` and `UnitRegistry` are the same shape.
- `freshUnitState` (`world-units.ts`) owns spawn defaults for world gameplay and the immutable `trainUnit` compatibility helper. Add new unit-state defaults here.
- `tileAt(reg, pos)`, `occupiedTileAt(reg, pos)`, `occupiedTiles(reg, tribe?)` — read-side helpers that keep board lookup and `UnitState` lookup paired. Prefer these over manually indexing `board[r_idx][q_idx]` and then `unitStates[id]`.
- `unitsLow.{spawn,move,remove,setHealth,setMode,addDebuff,recordKill}` are immutable compatibility helpers. Runtime combat uses world methods, `recordWorldKill` and `addWorldDebuff`.
- Combat hit resolution (lethal cascade, hero morale, orc_raider bloodlust, melee walk-onto-tile) lives in `../combat/resolve.ts`; this module no longer carries combat logic. The previous `resolveHit` was inlined into the resolver and per-unit abilities migrated to the `combat/abilities/` registry.

## Anti-patterns

- Runtime writes go through `GameWorld`. Compatibility callers replace the projected registry atomically; board occupants and `unitStates` must agree.
- Don't open-code `UnitState` literals at training sites. `trainUnit` exists so a new `UnitState` field has exactly one place to live.
- Don't pile combat-specific passives into this module. They live in `../combat/abilities/` keyed by unit type with hook phases (`preDamage`, `onDamage`, `postHit`, `onDeath`).

## Dependencies & Edges

- Runtime consumers: action feature executors, board generation, `../combat/resolve.ts` and its abilities. Registry compatibility helpers use `../board/unit-placement.ts` for paired projection updates.

## Patterns & Pitfalls

- New on-death effects belong in the `combat/abilities/` registry under the appropriate `onDeath` hook, not in this module.

Registry read helpers accept a readonly registry and return deeply readonly tile/unit/state views. Do not use a read result to change health, debuffs, or position. Lifecycle helpers retain their existing immutable update contract.

`UnitState.homeVillage` records the city whose capacity the unit occupies. `GameWorld.removeUnit` releases one slot only while that city still belongs to the unit's tribe. Movement preserves the link; capture clears links to the lost city. `null` means no capacity charge, including summoned heroes. Spawning does not charge capacity; recruitment owns that increment. Old saved-match versions are incompatible rather than migrated.
