# Combat

## Purpose & Scope

Deterministic attack resolution: validate attacker/defender, run the declarative damage pipeline, apply unit-specific abilities, resolve counter-attacks, and emit structured events. `dispatch` calls `resolveWorldCombat` against its private candidate world. `resolveCombat` is the immutable compatibility wrapper; `previewCombat` runs an isolated candidate for UI tooltips and bot scoring.

## Module layout

| File         | Role                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| `resolve.ts` | Resolver orchestrator: pre-damage → damage → post-hit → counter → on-death.  |
| `state.ts`   | Sealed `CombatState`, `Combatant`, `validate()`, `swapRoles()`.              |
| `range.ts`   | `canAttack`, `getEffectiveRangeWithTech`, `hexDistance`.                     |
| `modifiers/` | Private declarative damage pipeline (`computeDamage`).                       |
| `abilities/` | `UnitAbility` registry — one file per ability.                               |
| `types.ts`   | Wire-shaped public types: `AttackIntent`, `CombatResolution`, `CombatEvent`. |

Import resolver and preview functions from `combat/resolve.ts`, and the ability registry from `combat/abilities/abilities.ts`. There is no combat barrel.

## Entry Points & Contracts

- `resolveWorldCombat(world, attack)` executes against the caller's candidate. `resolveCombat(state, attack: AttackIntent)` creates that candidate and returns an Effect Result containing `{ state, events: readonly CombatEvent[], message }` on success. Discard failed candidates.
- `previewCombat(state, attack: AttackIntent) → CombatPreview`. Same validation, no mutation, no events. Returns `{ expected, counter }` for UI/bot. Must **never** be wired into a code path that then writes state — always call `resolveCombat` for execution.
- `canAttack(...)` / `getEffectiveRangeWithTech(...)` — read-only range checks, safe to call anywhere.
- `unitAbilities: ReadonlyArray<UnitAbility>` — the single registry. Add a new ability by appending to `abilities/abilities.ts`; never reach into `resolve.ts` to special-case a unit.
- **`CombatState` is sealed.** Branded type built only by the internal `validate()` / `swapRoles()` helpers. External code cannot construct one, so the damage pipeline never sees mid-combat-inconsistent input.
- The legacy `MODIFIER_ORDER` constant is now **module-private**. The pipeline order is enforced by tests against observable damage, not the array layout.

## Resolver phases

`resolveCombat` walks five phases in order. Abilities opt into one or more.

1. **`preDamage`** — last chance to short-circuit. Mirage dodge sets `dodged: true` and returns immediately, marking the attacker as `acted`.
2. **damage compute + `onDamage`** — pure damage from `modifiers/`, then bookkeeping hooks (e.g., Mirage marks the defender as having been attacked even on a successful hit).
3. **apply hit** — defender HP changes; if lethal, fires `onDeath`. Hooks here include hero-morale cascade and Orc Raider Bloodlust.
4. **`postHit` (forward)** — runs only when the defender survives. Source = attacker. Hex Curse from Black Knight lives here.
5. **counter-attack** — runs `beforeCounter` for Mirage before damage, then re-runs the modifier pipeline via `swapRoles`. A surviving target receives `postHit` exactly once, with source = defender and target = attacker. A dodged counter applies no hit effects. Counter kills pass `isCounter: true` to death hooks.

## Unit-ability registry

| Ability     | File                       | Hook(s)                                  | Notes                                                                                                          |
| ----------- | -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Mirage      | `abilities/mirage.ts`      | `preDamage`, `onDamage`, `beforeCounter` | First attack received per turn auto-dodges; same rule on counter step.                                         |
| Hex Curse   | `abilities/hex-curse.ts`   | `postHit`                                | 2-turn `atkReduction: 3` debuff on a surviving target; fires on forward and counter.                           |
| Bloodlust   | `abilities/bloodlust.ts`   | `onDeath`                                | Orc Raider heals 5 HP on a _forward_ kill, capped at effective max HP. No counter heal.                        |
| Hero morale | `abilities/hero-morale.ts` | `onDeath`                                | Any hero unit dying cascades `morale_loss` debuff to its tribe. One entry per hero.                            |
| Rampage     | `abilities/rampage.ts`     | `modeAfterAttack`                        | Sprinter: a forward kill leaves the killer in `moved` rather than `acted`, allowing a second attack this turn. |

Damage-side passives (Brace, Intimidate, Curse, Rage, Bushido, Fortify, Piercing Shot, Ambush, debuff-atkReduction, tech bonuses) live in `modifiers/index.ts` because they shape the damage number rather than introduce side effects.

## Anti-patterns

- Combat and ability hooks mutate `GameWorld` through its unit methods and `../units/world-units.ts`. Unit removal owns recruitment-capacity release; death hooks must not release it again.
- Don't add unit-specific `if (type === 'foo')` branches in `resolve.ts`. Push the logic into a new `UnitAbility` entry.
- Don't add modifier logic in counter-attack handling. Counter reuses the same modifier pipeline via `swapRoles`; branching on `isCounterAttack` inside a modifier is the correct pattern.
- Don't export new `CombatState` constructors. Sealing is deliberate.

## Dependencies & Edges

- Upstream: `../dispatch.ts` routes `{ kind: 'attack' }` here for both hosts. Bot attack scoring uses `previewCombat`.
- Downstream: `../engine/world-contract.ts`, `../units/world-units.ts`, `../unit-state-utils.ts`, `../domains/unit.ts` and `../domains/tech.ts`.

## Patterns & Pitfalls

- `hexDistance` here re-implements the `q_idx - radius` / `r_idx - radius` offset translation. Keep in sync with `../board/board.ts` if the coordinate convention ever changes.
- `CombatEvent.kill` fires _after_ `attack`/`counter` events for the same strike. Consumers ordering on events must preserve that.
- `damage-formula.ts` applies the recovered health curves to both forces, float32 arithmetic, and offset plus midpoint rounding. Counter strength comes from `counter-attack.ts`, including ship forms. Keep hero and tech modifiers in the existing pipeline.
- `previewCombat` runs the pure resolver and reads its primary hit/counter events. It must leave the source unchanged and match actual damage, including dodges and post-hit effects.

Tech-bonus predicates and deltas receive only deeply readonly attacker/defender data and the counter-attack flag. They cannot access the full game state or grid. `computeDamage` still requires the sealed `CombatState`; the resolver retains mutation ownership.

Knockback drowning eligibility is independent of ordinary boat speed: units already on water, naval units, and existing water-capable heroes survive; ordinary land units drown.
