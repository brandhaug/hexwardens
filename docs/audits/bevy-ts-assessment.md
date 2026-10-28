# bevy-ts engine assessment

Investigated 2026-09-28 against upstream commit `7bf99d1b2f810d31e586b334c4bcbd6512b965e9` and npm `@typeonce/bevy-ts@0.2.0`. The registry reported version 0.2.0 as latest, modified 2026-09-28. This is separate from the tooling migration; no engine dependency was added.

## Recommendation

Keep Hexwardens' current engine. bevy-ts can enforce useful access constraints, but adopting it would replace the state model and transaction boundaries that offline play, bots, fog snapshots, persistence and multiplayer already share. There is no evidence from this investigation that this rewrite would repay its migration cost.

The strongest ideas to borrow are deeply readonly read access and explicit system requirements. Hexwardens already has a single dispatch entry point, a unit registry that keeps board placement and unit state together, a branded combat state, and fog snapshots bound to their source state. Stricter compiler checks and mechanically enforced package boundaries improve these contracts without adding a second engine.

## What the library provides

The core is independent of its browser and Pixi adapters and has no declared runtime package dependencies. Its closed schema determines valid components and resources; a system declares read/write access; a runtime must provide the requirements of the schedule it ticks. Queries iterate in spawn order. These are suitable ingredients for a deterministic turn-based host, provided its random source and schedule are deterministic. See the [package manifest](https://github.com/SandroMaglione/bevy-ts/blob/7bf99d1b2f810d31e586b334c4bcbd6512b965e9/packages/core/package.json) and [concepts](https://github.com/SandroMaglione/bevy-ts/blob/7bf99d1b2f810d31e586b334c4bcbd6512b965e9/CONCEPTS.md).

A failed system rolls back its own ECS writes. Earlier successful systems stay committed. Structural commands wait for explicit schedule markers. Read values are deeply readonly. These are concrete guarantees, but they do not make a complete Hexwardens action or turn atomic. See [type architecture](https://github.com/SandroMaglione/bevy-ts/blob/7bf99d1b2f810d31e586b334c4bcbd6512b965e9/ARCHITECTURE.md).

Validated save/restore is available when every persisted descriptor has a decoder. A snapshot shares values with the world, so the runtime documentation advises serialization when a detached copy is needed. It is not a drop-in replacement for Hexwardens' immutable GameState or player-filtered network projection. See [Runtime.ts](https://github.com/SandroMaglione/bevy-ts/blob/7bf99d1b2f810d31e586b334c4bcbd6512b965e9/packages/core/src/Runtime.ts).

## Fit against the game contracts

| Existing contract                                             | Migration consequence                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch` returns success/failure and a new state            | Put all action writes in one system or add an explicit transaction adapter. A schedule alone does not roll back earlier systems. |
| Reference inequality controls persistence and React snapshots | Mutable runtime identity cannot replace immutable GameState identity. Introduce a detached projection or revision contract.      |
| Board coordinates and UnitRegistry remain consistent          | Model occupancy and unit components together; ECS typing does not itself enforce one unit per hex.                               |
| Seeded gameplay and bot simulations                           | Preserve seed/RNG state and clone isolation. Spawn order alone does not prove deterministic game behavior.                       |
| Server sends only FilteredGameState                           | Keep the fog projection and codec. An ECS world snapshot contains authoritative state and must never be sent to a player.        |
| Saved-match revisions and hibernating Durable Objects         | Define a versioned conversion and restore path. The ECS snapshot schema differs from the existing save format.                   |
| Canonical turn phase order                                    | Translate each existing phase deliberately and retain the phase-log regression evidence.                                         |
| Effect v4 errors and ports                                    | Adapt bevy-ts Result/Fx and services explicitly. Being inspired by Effect does not make it an Effect runtime.                    |

## Observed probe results

Failure cases were listed before writing the isolated probe. TypeScript 7.0.2 with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` accepted the program below and consumed all five expected-error directives. It rejected writes through read access, in-place read mutation, undeclared resource access, a foreign component and a schedule missing its resource.

Node 24.21.0 executed the same program with exit code 0. The first system incremented Turn from 0 to 1; the second wrote 101 then failed, restoring Turn to 1. Invalid restore left the saved data unchanged. Restoring the initial state and replaying the increment reproduced the saved data.

This is a focused type/runtime probe, not a benchmark, Worker compatibility test, full-game replay comparison or proof of fog safety. The investigation did not measure a performance improvement.

## Repeat the probe

Clone the exact upstream revision into a temporary directory named `hexwardens-bevy-audit`, beside `hexwardens-bevy-probe`. Save the program below as `hexwardens-bevy-probe/probe.ts`, with `{"type":"module"}` in that directory's package.json. Its tsconfig.json is:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noUncheckedIndexedAccess": true,
		"exactOptionalPropertyTypes": true,
		"noEmit": true,
		"allowImportingTsExtensions": true,
		"skipLibCheck": true,
		"types": []
	},
	"include": ["probe.ts"]
}
```

Run with TypeScript 7.0.2 and Node 24.21.0:

```sh
tsc -p hexwardens-bevy-probe/tsconfig.json
node hexwardens-bevy-probe/probe.ts
```

Both commands should exit 0 with no output. Removing the expected-error directives should produce the five intentional type errors. The source checkout is needed because this probe pins the inspected commit rather than assuming a package release has identical source.

```ts
import {
	Decode,
	Descriptor,
	Fx,
	Schema
} from '../hexwardens-bevy-audit/packages/core/src/index.ts'

const Position = Descriptor.ConstructedComponent(
	Decode.struct({ q: Decode.number, r: Decode.number })
)('Probe/Position')
const Turn = Descriptor.ConstructedResource(Decode.number)('Probe/Turn')
const Foreign = Descriptor.Component<number>()('Probe/Foreign')
const Game = Schema.bind(
	Schema.fragment({ components: { Position }, resources: { Turn } })
)
const ReadPositions = Game.Query({
	selection: { position: Game.Query.read(Position) }
})
const CheckReads = Game.System(
	'Probe/Read',
	{ queries: { positions: ReadPositions } },
	({ queries, resources }) => {
		for (const { data } of queries.positions.each()) {
			// @ts-expect-error Read cells expose no write capability.
			data.position.set({ q: 1, r: 0 })
			// @ts-expect-error Read values cannot be mutated in place.
			data.position.get().q = 1
		}
		// @ts-expect-error Resources must be declared by the system.
		resources.turn.get()
	}
)
const Increment = Game.System(
	'Probe/Increment',
	{ resources: { turn: Game.System.writeResource(Turn) } },
	({ resources }) => {
		resources.turn.update((turn) => turn + 1)
	}
)
function rejectedPrograms() {
	// @ts-expect-error Foreign component is outside the closed schema.
	Game.Query({ selection: { foreign: Game.Query.read(Foreign) } })
	const empty = Game.Runtime.make({ services: Game.Runtime.services() })
	// @ts-expect-error Runtime lacks the Turn resource required by the schedule.
	empty.tick(Game.Schedule(Increment))
	return CheckReads
}
void rejectedPrograms
const Fail = Game.System(
	'Probe/Fail',
	{ resources: { turn: Game.System.writeResource(Turn) } },
	({ resources }) => {
		resources.turn.update((turn) => turn + 100)
		return Fx.fail('Rejected')
	}
)
const made = Game.Runtime.make({
	services: Game.Runtime.services(),
	resources: { Turn: 0 }
})
if (!made.ok) throw new Error('valid resource rejected')
const runtime = made.value
const before = JSON.stringify(runtime.snapshot())
const failed = runtime.tick(Game.Schedule(Increment, Fail))
if (failed.ok) throw new Error('expected failure was swallowed')
const Inspect = Game.Inspector(
	'Probe/Inspect',
	{ resources: { turn: Game.System.readResource(Turn) } },
	({ resources }) => resources.turn.get()
)
if (runtime.inspect(Inspect) !== 1)
	throw new Error('expected earlier system commit and failed system rollback')
const saved = runtime.snapshot()
const invalid = runtime.restore({ invalid: true })
if (invalid.ok || JSON.stringify(runtime.snapshot()) !== JSON.stringify(saved))
	throw new Error('invalid restore mutated state')
if (!runtime.restore(JSON.parse(before)).ok) throw new Error('restore failed')
if (!runtime.tick(Game.Schedule(Increment)).ok)
	throw new Error('increment failed')
if (JSON.stringify(runtime.snapshot()) !== JSON.stringify(saved))
	throw new Error('replay data differs')
```

## Implemented engine contracts

The follow-up changes keep the existing engine and borrow read access restrictions at shared-data seams:

- `TileGrid` and `FilteredTileGrid` expose deeply readonly rows and tile data. `Board.tiles`, `Board.at`, `Board.entries`, and registry tile reads cannot edit occupancy, terrain, village perks, or shared unit stats. The wrapper still shares its source grid; immutable updates retain their existing reference behavior.
- Player getters expose `PlayerRead`. Callers cannot spend money, edit exploration, change research progress, or mutate the researched-tech array through a getter. `editPlayer` retains its validated mutation interface.
- Occupied-unit reads and derived actionable-unit/bot queries expose deeply readonly unit identity, stats, and state, including position and debuffs. Unit validators accept those reads without turning them back into mutable state. Unit lifecycle writes still use the paired registry.
- Movement legality requires only readonly units, player states, and the acting tribe. Its movement-budget helper takes only player states beyond its explicit board/unit inputs. Affordability and tech checks take only money and researched techs respectively. Effective maximum health needs only the veterancy health bonus.
- Tech-bonus callbacks receive readonly combatants and the counter-attack flag. They cannot inspect the authoritative game state or grid. The damage entry point still requires branded `CombatState`, and modifier ordering is unchanged.

`ReadonlyData` is a mapped type for plain engine records, unions, and arrays, not a general wrapper for services or class instances. Existing `ReadonlySet` views remain explicit. There is no runtime freezing, cloning on read, new engine dependency, schedule framework, or second state representation. The generator still deep-clones its inputs where it did before and obtains locally writable rows for construction. Story/test builders declare their own mutable rows. Wire schemas accept readonly grid/perk arrays with the same JSON shape and validation.

## Audit decisions and remaining limits

| Candidate                                  | Decision and reason                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Board, player getters, occupied-unit reads | Implemented above: these return shared objects whose mutation bypasses existing update owners.                                                                                                                                                                                                                                                   |
| Movement and tech-bonus requirements       | Narrowed using existing `Pick` and callback patterns; unrelated seed/state access now fails compilation.                                                                                                                                                                                                                                         |
| Fog snapshot source binding                | Keep the single-argument `commitExploration(snapshot)` and source binding. Grid reads are protected, but `sourceState` and non-grid projection fields still expose existing mutable owner types. Sealing all `GameState` data would also change save, host, and simulation ownership and is deferred rather than claiming complete immutability. |
| Bot fixture                                | Its player and board reads inherit protection. Full `gameState` remains available because existing scorers perform dispatch feasibility checks and lookahead. Per-scorer requirement declarations need a separate audit of that simulation interface. Seeded turn RNG and scorer order are unchanged.                                            |
| Combat resolver and ability hooks          | Retain sealed state and registry operations. The resolver owns state transitions; removing that authority would add indirection. Only pure tech-bonus readers lose broad access here.                                                                                                                                                            |
| Turn phases                                | Retain the private canonical registry and ordered `GameState` transformations. A generic read/write scheduler would add machinery without fixing a demonstrated ordering defect.                                                                                                                                                                 |
| Match host ports                           | Keep explicit clock, persistence, scheduler, codec, broadcast, and bot pacing ports. They have real offline/server adapters and already isolate host authority. Pure board/player/damage calculations are values, not new Effect services or Layers.                                                                                             |
| Whole-engine immutable owner types         | Deferred. TypeScript readonly views prevent operations through those views, not writes through an alias retained by a mutable owner. This change does not add a runtime immutability guarantee.                                                                                                                                                  |
| ECS and effect-machine migration           | Out of scope. No bevy-ts dependency or second runtime was introduced.                                                                                                                                                                                                                                                                            |

## Follow-up verification

Before implementation, `read-contracts.test.ts` listed forbidden player, board, registry, movement, and tech-bonus operations. Running `corepack pnpm -C packages/game-logic exec tsc --noEmit` reported 16 unused expected-error directives, demonstrating that every forbidden operation compiled against the old contracts. The same compile checks must consume all 16 directives after the change. Independent review then found derived actionable-unit and bot-query types widening readonly values. Seven more negative checks failed before repairing those declarations; all 23 checks now reject their forbidden operations. Runtime tests never execute those forbidden writes.

The existing generator, movement, combat, unit-registry, player, fog, bot replay, turn-order, offline host, and saved-match tests cover behavior and reference semantics. The browser regression path is `corepack pnpm -C apps/web exec playwright test smoke.spec.ts bot-vs-bot-full-game.spec.ts`, which includes the offline controls, rendered board, and ten seeded spectator turns. Final validation results are recorded below after running these commands.

Local validation on 2026-09-28 passed full lint, formatting, workspace TypeScript and native Effect diagnostics, dead-code regression checks, production build, Storybook build, infrastructure generation/operation checks, and the shared-D1 visibility check. Separate package runs passed 769 game-logic tests, 353 web tests, 210 game-server tests, and 55 lint-plugin tests. The repository script-test command skipped its 11 CI-gated cases locally.

The browser run used an ignored copy of the existing Playwright config at `apps/web/.playwright/engine-readonly.config.ts`, with base URL/port 3002, game-server port 8788, explicit worktree cwd, and `reuseExistingServer: false`. Port 3001 belonged to an unrelated app. The existing four affected checks passed: ten seeded spectator turns without page errors, End Turn visibility, keyboard-dialog dismissal, and a nonblank 3D board. The wider smoke run passed 10 of 11 checks; leaderboard loading failed in this alternate-port setup. No leaderboard code changed. Required CI runs the standard configuration.

Repeat the affected browser checks from a checkout with the standard ports free:

```sh
corepack pnpm -C apps/web exec playwright test smoke.spec.ts bot-vs-bot-full-game.spec.ts --grep 'offline|bot-vs-bot'
```

Expected result: four passing Chromium tests. Local exploratory runs also encountered sandbox localhost restrictions, one server-context timeout during concurrent builds, and one intermittent offline bot-completion assertion; the complete package suites passed on rerun without changing those tests or runtime behavior.
