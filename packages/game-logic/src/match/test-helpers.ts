import { Result } from 'effect'
import { type Tribe } from '../domains/tribe'
import { type MatchConfig, type ServerMessage } from '../multiplayer/types'
import {
	PersistenceError,
	type MatchBroadcast,
	type MatchClock,
	type MatchPersistence,
	type MatchScheduler
} from './ports'
import { type MatchState } from './types'

/**
 * Shared in-memory port fakes + config factories used by the match tests
 * (`logic.test.ts`, `step.test.ts`, `pump.test.ts`, `observer.test.ts`,
 * `offline.test.ts`, `offline.fog.test.ts`, `full-bot-match.test.ts`). Kept
 * alongside the module under test because every consumer lives in `match/`,
 * and centralising them kills the signature-drift risk that came from four
 * slightly-different copies of the same fakes.
 *
 * Each factory returns a fresh recorder — mutable arrays and counters are
 * exposed on the instance so tests can assert on calls without rebuilding
 * the port shape.
 */

export type PersistenceRecorder = MatchPersistence & {
	readonly savedStates: MatchState[]
	readonly loadCalls: () => number
	deleted: boolean
	failSaveStateOnce?: boolean
	failSaveMatchResultOnce?: boolean
}

export function inMemoryPersistence(
	initial: MatchState | null = null
): PersistenceRecorder {
	let state: MatchState | null = initial
	let loadCalls = 0
	const savedStates: MatchState[] = []
	const recorder: PersistenceRecorder = {
		savedStates,
		loadCalls: () => loadCalls,
		deleted: false,
		loadState() {
			loadCalls++
			return state
		},
		saveState(next) {
			if (recorder.failSaveStateOnce) {
				recorder.failSaveStateOnce = false
				return Result.fail(
					new PersistenceError({
						operation: 'saveState',
						message: 'disk full'
					})
				)
			}
			state = next
			savedStates.push(next)
			return Result.succeed(undefined)
		},
		deleteState() {
			state = null
			recorder.deleted = true
			return Result.succeed(undefined)
		},
		saveMatchResult() {
			if (recorder.failSaveMatchResultOnce) {
				recorder.failSaveMatchResultOnce = false
				return Promise.resolve(
					Result.fail(
						new PersistenceError({
							operation: 'saveMatchResult',
							message: 'd1 unavailable'
						})
					)
				)
			}
			return Promise.resolve(Result.succeed(undefined))
		}
	}
	return recorder
}

export type BroadcastRecorder = MatchBroadcast & {
	readonly tribeSends: { tribe: Tribe; msg: ServerMessage }[]
	readonly broadcasts: ServerMessage[]
	connected: Tribe[]
}

export function inMemoryBroadcast(connected: Tribe[] = []): BroadcastRecorder {
	const tribeSends: { tribe: Tribe; msg: ServerMessage }[] = []
	const broadcasts: ServerMessage[] = []
	return {
		tribeSends,
		broadcasts,
		connected: [...connected],
		sendToTribe(tribe, msg) {
			tribeSends.push({ tribe, msg })
		},
		broadcastAll(msg) {
			broadcasts.push(msg)
		},
		connectedTribes() {
			return this.connected
		}
	}
}

export type SchedulerRecorder = MatchScheduler & {
	readonly scheduled: number[]
	cancels: number
}

export function inMemoryScheduler(): SchedulerRecorder {
	const scheduled: number[] = []
	const recorder: SchedulerRecorder = {
		scheduled,
		cancels: 0,
		scheduleAt(time) {
			scheduled.push(time)
		},
		cancel() {
			recorder.cancels++
		}
	}
	return recorder
}

export type MutableClock = MatchClock & { value: number }

export function fixedClock(start = 0): MutableClock {
	const clock: MutableClock = {
		value: start,
		now() {
			return clock.value
		}
	}
	return clock
}

// --- Config factories ---

export function allBotConfig(): MatchConfig {
	return {
		mapSize: 'small',
		turnTimerSeconds: null,
		players: [
			{
				playerId: 'bot-1',
				username: 'Legend Bot',
				tribe: 'barbarians',
				isBot: true,
				botDifficulty: 'Legend'
			},
			{
				playerId: 'bot-2',
				username: 'Beginner Bot',
				tribe: 'rogues',
				isBot: true,
				botDifficulty: 'Beginner'
			}
		]
	}
}

export function humanVsBotConfig(): MatchConfig {
	return {
		mapSize: 'small',
		turnTimerSeconds: null,
		players: [
			{
				playerId: 'player-1',
				username: 'Human',
				tribe: 'barbarians',
				isBot: false,
				botDifficulty: 'Beginner'
			},
			{
				playerId: 'bot-1',
				username: 'Bot',
				tribe: 'rogues',
				isBot: true,
				botDifficulty: 'Beginner'
			}
		]
	}
}

export function humanVsHumanConfig(): MatchConfig {
	return {
		mapSize: 'small',
		turnTimerSeconds: 60,
		players: [
			{
				playerId: 'p1',
				username: 'alice',
				tribe: 'barbarians',
				isBot: false,
				botDifficulty: 'Beginner'
			},
			{
				playerId: 'p2',
				username: 'bob',
				tribe: 'rogues',
				isBot: false,
				botDifficulty: 'Beginner'
			}
		]
	}
}
