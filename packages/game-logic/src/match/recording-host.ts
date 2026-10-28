import { Result } from 'effect'
import { type MatchLogData, type MatchLifecycleEvent } from './ports'
import { type BotTurnRun } from '../bot/bot-turn'
import { type Difficulty } from '../difficulty'
import { type Tribe } from '../domains/tribe'
import { type GameState } from '../game'
import { type MatchResult, type ServerMessage } from '../multiplayer/types'
import { type MatchHost } from './host'

import { type MatchState } from './types'

/**
 * One entry in the {@link RecordingMatchHost} call log. Each variant carries
 * the full payload the host received so tests can assert on the *exact*
 * sequence of host invocations a command produced — the cleanest way to
 * keep all hosts (CF DO, offline, recording) in lockstep.
 *
 * `effect` mirrors the {@link MatchHost} method names rather than the
 * underlying {@link MatchEffect} kinds — easier to read in failing-test
 * output and decouples assertions from the discriminator we picked for the
 * effect ADT.
 */
export type RecordedCall =
	| { effect: 'saveState'; state: MatchState }
	| { effect: 'projectState'; state: MatchState }
	| { effect: 'sendToTribe'; tribe: Tribe; msg: ServerMessage }
	| { effect: 'broadcastAll'; msg: ServerMessage }
	| { effect: 'endGame'; result: MatchResult }
	| { effect: 'destroyMatch' }
	| { effect: 'log'; event: string; data?: MatchLogData }
	| {
			effect: 'scheduleBotTurn'
			tribe: Tribe
			difficulty: Difficulty
			gameState: GameState
	  }
	| { effect: 'lifecycle'; event: MatchLifecycleEvent }

export type RecordingMatchHost = MatchHost & {
	/** Ordered list of host calls — newest at the end. */
	readonly calls: RecordedCall[]
	/**
	 * Convenience: just the effect names in invocation order. The cleanest
	 * way to write parity tests across hosts without coupling to message
	 * payloads.
	 */
	effectSequence(): RecordedCall['effect'][]
	/**
	 * Inject a `BotTurnRun` for the next `scheduleBotTurn` call. Tests use
	 * this to deterministically resolve a bot turn without invoking the real
	 * `runBotTurn` (which is non-trivial and exercised elsewhere).
	 *
	 * Each value is consumed once, in queue order. If the queue is empty
	 * when `scheduleBotTurn` fires, the host emits a `botTurnFailed`
	 * lifecycle and resolves immediately — preserves the
	 * `started == completed + failed` observer invariant.
	 */
	queueBotTurn(run: BotTurnRun): void
}

export type RecordingMatchHostOptions = {
	/**
	 * Optional callback fired *after* each `saveState`. Lets tests track the
	 * "current" match state for use as the next `runMatchCommand` argument
	 * without re-deriving it from the recording.
	 */
	onSaveState?: (state: MatchState) => void
	/**
	 * Optional callback fired *after* each `scheduleBotTurn` resolves with a
	 * queued `BotTurnRun`. Tests use this to inject a follow-up `dispatch`
	 * call (e.g. `botTurnResolved`) — recording hosts deliberately don't
	 * run their own dispatch loop because doing so duplicates the
	 * orchestration logic under test.
	 */
	onBotTurnResolved?: (tribe: Tribe, run: BotTurnRun) => Promise<void> | void
}

/**
 * Test adapter that records every host call to a flat array. Combined with
 * {@link runMatchCommand}, this is the simplest way to assert on the exact
 * effect sequence a `MatchCommand` produces — without spinning up a full
 * `createMatchLogic` / `MatchPersistence` / `MatchBroadcast` triple.
 *
 * **Not** intended for end-to-end tests of the production `dispatchCommand`
 * machinery — those still go through `createMatchLogic` with
 * in-memory ports. `RecordingMatchHost` proves the orchestrator + host
 * interface alone are correct, regardless of which production adapter
 * implements them.
 */
export function createRecordingMatchHost(
	opts: RecordingMatchHostOptions = {}
): RecordingMatchHost {
	const calls: RecordedCall[] = []
	const queuedRuns: BotTurnRun[] = []

	const host: RecordingMatchHost = {
		calls,
		effectSequence() {
			return calls.map((c) => c.effect)
		},
		queueBotTurn(run) {
			queuedRuns.push(run)
		},
		saveState(state) {
			calls.push({ effect: 'saveState', state })
			opts.onSaveState?.(state)
			return Result.succeed(undefined)
		},
		projectState(state) {
			calls.push({ effect: 'projectState', state })
		},
		sendToTribe(tribe, msg) {
			calls.push({ effect: 'sendToTribe', tribe, msg })
		},
		broadcastAll(msg) {
			calls.push({ effect: 'broadcastAll', msg })
		},
		endGame(result) {
			calls.push({ effect: 'endGame', result })
			return Promise.resolve()
		},
		destroyMatch() {
			calls.push({ effect: 'destroyMatch' })
		},
		log(event, data) {
			const call: RecordedCall = { effect: 'log', event }
			if (data) {
				call.data = data
			}
			calls.push(call)
		},
		async scheduleBotTurn(tribe, difficulty, gameState) {
			calls.push({ effect: 'scheduleBotTurn', tribe, difficulty, gameState })
			const run = queuedRuns.shift()
			if (!run) {
				return
			}
			await opts.onBotTurnResolved?.(tribe, run)
		},
		emitLifecycle(event) {
			calls.push({ effect: 'lifecycle', event })
		}
	}

	return host
}
