# Actions

## Purpose & Scope

Tile-scoped player actions that mutate a command-local `GameWorld` and return an immutable `GameState` projection. Owns the `ActionType` vocabulary and the Action Engine that validates and applies intents. `dispatch.ts` routes movement to `moveWorldUnit` and attacks to `resolveWorldCombat`.

## Entry Points & Contracts

- `ActionIntent` (`intent.ts`) — discriminated union describing _what the player wants to do at a tile_. One kind per feature: `build | capture | collect | explore | heal | recover | retire | upgrade-to-large | train | research | selectPerk`. Intents carry no tribe; the acting/previewing Tribe is an explicit parameter of the engine interface.
- `actionFeatures` (`registry.ts`) registers each Action kind's preview, plan, inspection and world executor. The feature's `plan.ts` owns those operations together.
- `createActionPlanner(state, tribe, at)` (`engine.ts`) → `ActionPlanner { plan, execute, availableActions }` — **the** per-operation handle. Constructed once per `(GameState, Tribe, position)` operation; derives the `ActionContext` (tile lookup, `Board`, Tribe territory, hex radius) exactly once at construction and serves every method call from that single derivation. `tribe` is explicit — pass a non-current Tribe to preview its actions; the planner aligns `context.gameState.currentPlayerTribe` with it once at construction (callers never swap `currentPlayerTribe` on the state themselves).
- `planAction(state, intent)` → `ActionPlan = { kind: 'allowed', intent, cost, preview } | { kind: 'denied', intent, reason }`. One-shot wrapper over `createActionPlanner` for the current player. Runs every validation once (target legality, cost, tech, population, ...) and returns either an `allowed` plan with a UI preview or a typed denial.
- `ActionExecution` (`actions.ts`) owns the `{ state: GameState, message: string }` feature execution result.
- `executePlan(state, plan: AllowedActionPlan)` → `ActionExecution`. One-shot wrapper; the parameter type **rejects denied plans at compile time** — denial cannot pass through to mutation.
- `availableActions(state, tribe, at)` → `AllowedActionPlan[]`. Every returned plan is guaranteed to plan as `allowed` — this is the canonical "what buttons should I show" query. Single context derivation for the whole enumeration.
- `createGameWorld` validates board/unit consistency on import. World writes validate records and maintain occupancy indexes before detached projection.

`ActionType = SimpleActionType | 'train-${UnitType}' | 'research-${Tech}'` (`actions.ts`) is **public** for UI rendering — the action bar maps these strings to button labels and click handlers.

## Usage Patterns

Actions are never invoked directly from the UI. The canonical chain is:

```ts
// UI -> dispatch.ts -> engine.planAction/executePlan
dispatch(state, tribe, { kind: 'tileAction', action: { kind: 'capture', at } })
```

`dispatch.ts` holds one `ActionPlanner` per tileAction operation. The planner derives `ActionContext` once and delegates validation through `registry.ts` to `features/<feature>/plan.ts`. `executeIn(world, plan)` applies the allowed plan to the dispatch-owned candidate; `execute(plan)` creates its own candidate for compatibility callers. Feature planners receive the context rather than rebuilding it. Tribe territory comes from `board/tribe-range.ts::getTribeVillageRange`.

For UI gating without intent execution:

```ts
import { availableActions } from '@hexwardens/game-logic/dispatch' // returns AllowedActionPlan[]
// or, for the full plan with cost + preview:
import { availableActions } from '@hexwardens/game-logic/actions/engine'
```

## Anti-patterns

- Don't import per-feature `plan.ts` files from outside `actions/`. They're private — go through the engine.
- Don't expand `ActionType` with free-form strings. Add to `SimpleActionType` or the train/research prefix families and add an `ActionIntent` variant.
- Register planning and execution together in `registry.ts` when adding an Action.
- Host gameplay uses `executeCommittedIntent` through the match path so dispatch validation and exploration commits run. Planning helpers remain available for read-only UI queries and tests.
- Don't preview another Tribe's actions by swapping `state.currentPlayerTribe` yourself — pass the tribe to `createActionPlanner` / `availableActions`; the planner owns the alignment.
- Don't cache an `ActionPlanner` across state mutations. It is bound to the state it was constructed from; build a fresh one per operation.
- Spend through `GameWorld.editPlayer` and its validated draft, see `../player/AGENTS.md`.

## Dependencies & Edges

- Consumed by: `../dispatch.ts`; bots execute through `executeCommittedIntent`.
- Uses: `../engine/world-contract.ts` for mutations, `../domains/*` for cost/tech tables, `../board/board.ts` for range math.
- Siblings: `../combat/` (attack), `../board/` (move), `../turns/` (end-of-turn phases).

## Patterns & Pitfalls

- Per-feature `plan.ts` files own preview, validation, inspection and world mutation. Shared village reward mutations live in `village-rewards.ts`.
- The legacy template-literal parsing (`train-${Unit}`, `research-${Tech}`) lives in `intent.ts::actionTypeToIntent`. Don't push it into individual handlers.
- The Action Engine validates once. Execution accepts only `AllowedActionPlan`; keep authorization in the planning path. Discard the whole candidate world on failure, including earlier writes in the command.

`authority.ts` validates ownership and territory for both direct intents and enumeration before feature planning. A planner rejects intents targeting a different position. Feature previews are not an authorization boundary. Recruitment sets `mode: acted` and records `homeVillage`; starting units remain ready. Capture resets occupied population, releases old home links, and drops the former owner's pending rewards for that city.

Construction requires the matching primary or secondary technology; Large upgrades require the matching mastery. Build and upgrade cost 5 gold and award 2 development through shared game constants. Collection always costs 2 gold without technology rebates. Apple/leather use Fruit/Meat Harvesting gates; pearl, gem, and granite retain their existing gates. Wheat remains ungated for guaranteed capital openings; other resource mappings remain unchanged.

`inspectTileActions` returns relevant allowed and denied commands with planner-owned validation reasons. Each feature's optional `inspect` registration owns relevant targets and outcome descriptions; `ActionPlanner.inspectActions` enumerates them through the same authority and planning path. Keep target rules out of the presentation wrapper. Inspection is read-only and must not execute a plan or expose stored ruins rewards. Gameplay still commits through `dispatch`.
