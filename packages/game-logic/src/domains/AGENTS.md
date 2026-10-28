# Domains

## Purpose & Scope

Static, pure value types and lookup tables for the game's entities: `Unit`, `Tribe`, `Tech`, `Village`, `Resource`, `Ruins`, primary/secondary buildings, and village progression thresholds. This is the _vocabulary_ of the game — no runtime state lives here; every file is stats/constants + small predicates.

## Entry Points & Contracts

- `unit.ts` — `UnitType` string union, `unitToUnitStats` lookup (attack/defense/range/health/movement/passive/explorationRange), `UnitState` (per-instance: id, mode, health, veterancy, debuffs, flags), `isHeroUnitType`, `cavalryUnitTypes`, `getEffectiveMaxHealth`. Heroes have static stats per ADR-0001; they are summoned via the level-5 `special_unit` Village Perk (see `actions/features/select-perk/`), never trained with gold.
- `tribe.ts` — `Tribe` union, `tribeToTribeStats`, `getAllTribesOnBoard`, `getTribeVillageRange(board, tribe)` (returns `Set<PositionKey>` of tiles within tribe's village sphere of influence — the canonical visibility + action range).
- `tech.ts` — `Tech` union, research costs/turns, `hasTechPassive(techs, passive)` — passives are namespaced strings like `'ranged_bonus'`, `'mountain_traversal'`. Adding a passive requires touching combat and the consuming feature, not just this file.
- `village.ts` + `village-progression.ts` — village state and XP threshold ladder (`village-progression.test.ts` asserts the thresholds).
- `resource.ts`, `ruins.ts`, `primary-building.ts`, `secondary-building.ts` — tile-item vocabularies.

## Anti-patterns

- Don't import from `domains/` into new `domains/` files to create cross-type lookup tables. Use small adapter functions in the consuming module instead — keeping domain files standalone prevents circular imports.
- Don't store per-match state here. `Tech` is a name; `researchedTechs` lives in `PlayerState`. `UnitType` is a name; per-unit `UnitState` lives in `GameState.units.unitStates`.
- Don't add a unit/tech passive without wiring it to the modifier pipeline in `../combat/` (for combat passives) or the matching feature handler (for utility passives). The name alone does nothing.

## Dependencies & Edges

- Consumed by ~every other game-logic module. This is the leaf all code reads.
- No intra-module edges: domains files reference each other sparingly (e.g. `tribe.ts` knows `Board`/`PositionKey` to compute village range).

## Patterns & Pitfalls

- `getTribeVillageRange` is the source of truth for "what counts as within a village" — used by fog-of-war visibility, `ActionContext.isWithinVillageRange`, training, building. If you need a similar range check, call this rather than re-implementing.
- `unitToUnitStats` is read a lot on hot paths (combat). Keep it a plain object literal — don't wrap in lazy initializers.

Village perks are readonly collections. Derive a replacement array when choosing a perk. `getEffectiveMaxHealth` requires only `veterancyBonusHp` from instance state; hero-alive queries accept a readonly `TileGrid`.

City reward progression: level 2 offers sight or immediate gold; level 3 offers capacity or borders; level 4 offers development or recurring income. The level-5 hero choice remains. Capacity rewards increase `maxPopulation`, never occupied `population`. XP rewards use normal progression and preserve newly queued prompts. Later level-ups add base salary/capacity deltas, preserving earned bonuses. `village-income.ts` supplies the same income calculation to turn settlement and the HUD.

Research prices match the recovered table for 1–45 owned cities through `getTechResearchCost`; outside that range the legacy linear rule remains. New capitals start with 2 income, regular villages with 1. Level-up income deltas preserve capital and reward bonuses. Existing saved salaries remain unchanged.
