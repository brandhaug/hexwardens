import { getAliveTribes } from '../game'
import { createCodec } from './codec'
import { createMatchLogic } from './logic'
import { type MatchLifecycleEvent, type PersistenceError } from './ports'
import {
	allBotConfig,
	fixedClock,
	inMemoryBroadcast,
	inMemoryPersistence,
	inMemoryScheduler
} from './test-helpers'

const TARGET_TURN = 30

describe('full bot-vs-bot match', () => {
	it(`plays at least ${TARGET_TURN} turns through createMatchLogic without errors`, async () => {
		const clock = fixedClock(0)
		const persistence = inMemoryPersistence()
		const scheduler = inMemoryScheduler()
		const errors: PersistenceError[] = []
		const events: MatchLifecycleEvent[] = []
		const logic = createMatchLogic({
			persistence,
			broadcast: inMemoryBroadcast(),
			scheduler,
			clock,
			codec: createCodec(),
			onPersistenceError: (e) => errors.push(e),
			observer: { onLifecycle: (e) => events.push(e) }
		})

		const init = await logic.init(allBotConfig(), 'probe-1')
		expect(init.ok).toBe(true)

		// Init must schedule the first bot turn — no human → no turn timer.
		const initialState = logic.getState()
		expect(initialState?.turnSchedule).toEqual({ kind: 'bot', deadline: 0 })

		// Drive the match forward via `pump` with a semantic predicate.
		// Observer is the oracle for "something happened" — tests no longer
		// poll `getState()` between alarms. Any `botTurnFailed` event
		// surfaces a scorer/executor exception that the old polling loop
		// hid.
		//
		// `state.turn` only increments when rotation wraps (once per round).
		// The predicate lets `pump` short-circuit as soon as the target is
		// reached. We still nudge the clock forward between pump calls so
		// bot-turn deadlines (`kind: 'bot', deadline: now`) become due on
		// each iteration — `pump` itself doesn't advance time.
		const MAX_OUTER_ITERATIONS = 400
		let finalReason: Awaited<ReturnType<typeof logic.pump>>['reason'] =
			'cap-exhausted'
		for (let i = 0; i < MAX_OUTER_ITERATIONS; i++) {
			const gs = logic.getState()?.gameState
			if (!gs) {
				break
			}
			if (events.some((e) => e.t === 'gameOver')) {
				finalReason = 'game-over'
				break
			}
			if (gs.turn >= TARGET_TURN) {
				finalReason = 'predicate-met'
				break
			}

			expect(getAliveTribes(gs).length).toBeGreaterThan(0)

			clock.value += 1
			const result = await logic.pump({
				until: (s) => s.gameState.turn >= TARGET_TURN,
				maxSteps: 10_000
			})
			finalReason = result.reason
			if (
				result.reason === 'idle' ||
				result.reason === 'blocked-on-human' ||
				result.reason === 'game-over' ||
				result.reason === 'predicate-met' ||
				result.reason === 'destroyed'
			) {
				break
			}
		}
		expect([
			'predicate-met',
			'game-over',
			'idle',
			'blocked-on-human'
		]).toContain(finalReason)

		// No silent scorer failures.
		expect(events.filter((e) => e.t === 'botTurnFailed')).toEqual([])

		const final = logic.getState()
		expect(final).not.toBeNull()
		assert(final)

		expect(
			final.gameState.isGameOver || final.gameState.turn >= TARGET_TURN
		).toBe(true)
		const winner = final.gameState.winner
		expect(
			!final.gameState.isGameOver ||
				winner === null ||
				winner === 'barbarians' ||
				winner === 'rogues'
		).toBe(true)
		expect(errors).toEqual([])

		// Observer invariants on the collected event stream.
		// `botTurnStarted` must pair with a terminal (`Completed` | `Failed`).
		const startedCount = events.filter((e) => e.t === 'botTurnStarted').length
		const completedCount = events.filter(
			(e) => e.t === 'botTurnCompleted'
		).length
		const failedCount = events.filter((e) => e.t === 'botTurnFailed').length
		expect(completedCount + failedCount).toBe(startedCount)

		// `gameOver` fires at most once.
		expect(events.filter((e) => e.t === 'gameOver').length).toBeLessThanOrEqual(
			1
		)
	}, 60_000)
})
