import {
	createTestGameState,
	createTestPlayerStates
} from '../test/game-test-helpers'
import { createCodec } from './codec'
import { createMatchLogic, type MatchLogic } from './logic'
import { type MatchLifecycleEvent } from './ports'
import {
	allBotConfig,
	fixedClock,
	humanVsHumanConfig,
	inMemoryBroadcast,
	inMemoryPersistence,
	inMemoryScheduler,
	type MutableClock
} from './test-helpers'
import { type MatchConfig } from '../multiplayer/types'
import { type MatchState } from './types'

/**
 * Boundary tests for {@link MatchLogic.pump}. These live beside `logic.ts`
 * because `pump` is a method on the logic factory — the tests exercise
 * termination reasons, step accounting, predicate short-circuiting, and the
 * `onAlarm` compatibility contract. `full-bot-match.test.ts` covers the
 * bot-chain integration path; here we focus on reason semantics and bounds.
 */

// Two bots on a canonical config — forks `allBotConfig()` minimally so we
// keep the shared helper as the single source for player shape.
const twoBotConfig = allBotConfig

function baseMatchState(overrides: Partial<MatchState> = {}): MatchState {
	const gameState = createTestGameState({
		playerStates: createTestPlayerStates({
			barbarians: {
				id: 'player_barbarians',
				name: 'alice',
				tribe: 'barbarians',
				money: 5,
				exploration: {},
				researchedTechs: [],
				researchInProgress: null,
				isBot: false,
				difficulty: 'Beginner'
			},
			rogues: {
				id: 'player_rogues',
				name: 'bob',
				tribe: 'rogues',
				money: 5,
				exploration: {},
				researchedTechs: [],
				researchInProgress: null,
				isBot: false,
				difficulty: 'Beginner'
			}
		})
	})
	return {
		matchId: 'match-pump',
		gameState,
		config: humanVsHumanConfig(),
		startedAt: 0,
		dailyDate: '2026-05-05',
		playerIdToTribe: { p1: 'barbarians', p2: 'rogues' },
		turnSchedule: null,
		cleanupDeadline: null,
		disconnectedPlayers: {},
		connectionCount: 2,
		...overrides
	}
}

type Env = {
	logic: MatchLogic
	clock: MutableClock
	events: MatchLifecycleEvent[]
}

it('does not rearm expired cleanup while a player keeps the results open', async () => {
	const state = baseMatchState()
	const scheduler = inMemoryScheduler()
	const logic = createMatchLogic({
		persistence: inMemoryPersistence({
			...state,
			gameState: { ...state.gameState, isGameOver: true, winner: 'barbarians' },
			connectionCount: 1,
			cleanupDeadline: 1000
		}),
		broadcast: inMemoryBroadcast(),
		scheduler,
		clock: fixedClock(1100),
		codec: createCodec()
	})
	await logic.onAlarm()
	await logic.onAlarm()
	expect(scheduler.scheduled).toEqual([])
	await logic.onPlayerDisconnected('p1', 'barbarians', 'alice')
	expect(scheduler.scheduled.at(-1)).toBe(1000)
	await logic.onAlarm()
	expect(logic.getState()).toBeNull()
})

async function buildLogic(opts: {
	state?: MatchState | null
	initConfig?: MatchConfig
	now?: number
}): Promise<Env> {
	const clock = fixedClock(opts.now ?? 0)
	const events: MatchLifecycleEvent[] = []
	const logic = createMatchLogic({
		persistence: inMemoryPersistence(opts.state ?? null),
		broadcast: inMemoryBroadcast(),
		scheduler: inMemoryScheduler(),
		clock,
		codec: createCodec(),
		observer: { onLifecycle: (e) => events.push(e) }
	})
	if (opts.initConfig) {
		const init = await logic.init(opts.initConfig, 'pump-test')
		assert(init.ok)
	}
	return { logic, clock, events }
}

describe('MatchLogic.pump — termination reasons', () => {
	it('cleans up an ended match at its durable deadline, even with expired disconnect records', async () => {
		const base = baseMatchState()
		const { logic } = await buildLogic({
			state: {
				...base,
				gameState: {
					...base.gameState,
					isGameOver: true,
					winner: 'barbarians'
				},
				connectionCount: 0,
				cleanupDeadline: 100,
				disconnectedPlayers: {
					p2: { tribe: 'rogues', username: 'bob', deadline: 50 }
				}
			},
			now: 200
		})
		const result = await logic.pump()
		expect(result.reason).toBe('destroyed')
		expect(logic.getState()).toBeNull()
	})

	it("returns 'idle' when no scheduled wake exists", async () => {
		// Human config with `turnTimerSeconds: null` means init produces
		// `turnSchedule: null`. Nothing for pump to drain.
		const config: MatchConfig = {
			...humanVsHumanConfig(),
			turnTimerSeconds: null
		}
		const { logic } = await buildLogic({ initConfig: config, now: 100 })

		const r = await logic.pump()

		expect(r.reason).toBe('idle')
		expect(r.stepsTaken).toBe(0)
		expect(r.finalState).not.toBeNull()
	})

	it("returns 'blocked-on-human' when only a future human-turn deadline exists", async () => {
		const { logic } = await buildLogic({
			initConfig: humanVsHumanConfig(),
			now: 1000
		})
		// init schedules a 60s human turn timer → deadline 61_000. `now` is
		// still 1_000, so pump has nothing due but is gated on human input.
		const r = await logic.pump()

		expect(r.reason).toBe('blocked-on-human')
		expect(r.stepsTaken).toBe(0)
	})

	it("returns 'destroyed' when state has been torn down", async () => {
		const initial = baseMatchState({
			cleanupDeadline: 1000,
			connectionCount: 0
		})
		const { logic, clock } = await buildLogic({ state: initial })
		clock.value = 2000

		// cleanup runs, emits matchDestroyed, pump then sees null state.
		const r = await logic.pump()

		expect(r.reason).toBe('destroyed')
		expect(r.finalState).toBeNull()
		expect(r.stepsTaken).toBeGreaterThanOrEqual(1)
	})

	it("returns 'game-over' once the match has ended", async () => {
		const base = baseMatchState()
		const initial: MatchState = {
			...base,
			gameState: {
				...base.gameState,
				isGameOver: true,
				winner: 'barbarians'
			}
		}
		const { logic } = await buildLogic({ state: initial, now: 10 })

		const r = await logic.pump()

		expect(r.reason).toBe('game-over')
		expect(r.stepsTaken).toBe(0)
	})
})

describe('MatchLogic.pump — predicate & cap', () => {
	it("returns 'predicate-met' and short-circuits the loop", async () => {
		const { logic } = await buildLogic({ initConfig: twoBotConfig(), now: 0 })

		// Predicate fires on first evaluation — pump should stop immediately.
		const r = await logic.pump({ until: () => true, maxSteps: 10 })

		expect(r.reason).toBe('predicate-met')
		expect(r.stepsTaken).toBe(0)
	})

	it('short-circuits mid-loop when the predicate becomes true after N evaluations', async () => {
		const { logic, clock } = await buildLogic({
			initConfig: twoBotConfig(),
			now: 0
		})
		clock.value = 1

		// Stop once the predicate has been evaluated 3 times. `pump`
		// evaluates `until` before each step, so reaching count 3 means the
		// first two evaluations returned false (2 steps dispatched) and the
		// third short-circuited before a step.
		let evals = 0
		const r = await logic.pump({
			until: () => ++evals >= 3,
			maxSteps: 10
		})

		expect(r.reason).toBe('predicate-met')
		expect(r.stepsTaken).toBe(2)
	}, 30_000)

	it("returns 'cap-exhausted' with stepsTaken === maxSteps for a bot chain", async () => {
		const { logic, clock } = await buildLogic({
			initConfig: twoBotConfig(),
			now: 0
		})
		// Advance clock so the bot-deadline = 0 is due.
		clock.value = 1

		// Each `runBotTurn` is one step. Cap at 3 — pump should dispatch
		// exactly 3 commands before exiting.
		const r = await logic.pump({ maxSteps: 3 })

		expect(r.reason).toBe('cap-exhausted')
		expect(r.stepsTaken).toBe(3)
	}, 30_000)
})

describe('MatchLogic.pump — bot chain integration', () => {
	it('processes bot turns in order; turnAdvanced count is bounded by stepsTaken', async () => {
		const { logic, clock, events } = await buildLogic({
			initConfig: twoBotConfig(),
			now: 0
		})
		clock.value = 1

		const r = await logic.pump({ maxSteps: 6 })

		// Each runBotTurn dispatch emits a turnAdvanced lifecycle event once
		// the bot's turn folds back in. With maxSteps=6, pump dispatches at
		// most 6 bot turns → at most 6 turnAdvanced events.
		const turnAdvancedCount = events.filter(
			(e) => e.t === 'turnAdvanced'
		).length
		expect(turnAdvancedCount).toBeLessThanOrEqual(r.stepsTaken)
		expect(turnAdvancedCount).toBeGreaterThan(0)
		// Every started bot turn must have a terminal event.
		const started = events.filter((e) => e.t === 'botTurnStarted').length
		const completed = events.filter((e) => e.t === 'botTurnCompleted').length
		const failed = events.filter((e) => e.t === 'botTurnFailed').length
		expect(completed + failed).toBe(started)
	}, 30_000)
})

describe('MatchLogic.onAlarm — preserves legacy semantics over pump', () => {
	it('forfeits a disconnected player past the grace deadline', async () => {
		const initial = baseMatchState({
			disconnectedPlayers: {
				p2: { tribe: 'rogues', username: 'bob', deadline: 5000 }
			}
		})
		const { logic, events } = await buildLogic({ state: initial, now: 10_000 })

		await logic.onAlarm()

		// Forfeit propagates via sealOutcome → the match may end; either way
		// we should see no lingering disconnected entry.
		const after = logic.getState()
		expect(after?.disconnectedPlayers['p2']).toBeUndefined()
		// Observer stream is the oracle: no rejected commands.
		expect(events.filter((e) => e.t === 'commandRejected')).toEqual([])
	})

	it('fires turnTimeout when human-turn deadline has elapsed', async () => {
		const initial = baseMatchState({
			turnSchedule: { kind: 'human', deadline: 5000 }
		})
		const { logic } = await buildLogic({ state: initial, now: 10_000 })

		await logic.onAlarm()

		const after = logic.getState()
		// turnTimeout advances the turn; deadline is no longer 5_000.
		expect(after?.turnSchedule?.deadline).not.toBe(5000)
	})
})
