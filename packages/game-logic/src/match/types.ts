import { type MatchLogData, type MatchLifecycleEvent } from './ports'
import { type BotTurnRun } from '../bot/bot-turn'
import { type Difficulty } from '../difficulty'
import { type Tribe } from '../domains/tribe'
import { type Intent } from '../dispatch'
import { type GameState } from '../game'
import {
	type MatchConfig,
	type MatchResult,
	type ServerMessage
} from '../multiplayer/types'
import { type DailyDate } from '../daily-challenge/seed'
import { type Chronicle } from './chronicle/chronicle'

export const RECONNECT_GRACE_MS = 60 * 1000
export const CLEANUP_DELAY_MS = 10 * 60 * 1000

export type MatchCommand =
	| { kind: 'hostResumed' }
	| { kind: 'perform'; tribe: Tribe; intent: Intent }
	| { kind: 'endTurn'; tribe: Tribe }
	| {
			kind: 'forfeit'
			tribe: Tribe
			username: string
			disconnectedPlayerId?: string
	  }
	| { kind: 'turnTimeout' }
	| { kind: 'runBotTurn' }
	| {
			kind: 'botTurnResolved'
			tribe: Tribe
			run: BotTurnRun
			baseGameState?: GameState
	  }
	| {
			kind: 'playerDisconnected'
			playerId: string
			tribe: Tribe
			username: string
	  }
	| { kind: 'playerReconnected'; playerId: string }
	| { kind: 'connectionOpened'; playerId: string }
	| { kind: 'connectionClosed'; playerId: string }
	| { kind: 'cleanup' }

export type DisconnectInfo = {
	tribe: Tribe
	username: string
	deadline: number
}

// Scheduled wake for turn handling. `human` fires `turnTimeout` at the
// deadline (force-advance); `bot` fires `runBotTurn` (execute bot's turn).
// `null` means no scheduled wake — either game over or a human turn with no
// configured turn timer.
export type TurnSchedule =
	| { kind: 'human'; deadline: number }
	| { kind: 'bot'; deadline: number }

export type MatchState = {
	/** Independent execution facts; turn ownership and game-over come from gameState. */
	execution?: 'bot-running' | 'cleanup-pending'
	matchId: string
	gameState: GameState
	config: MatchConfig
	startedAt: number
	dailyDate: DailyDate
	playerIdToTribe: Record<string, Tribe>
	turnSchedule: TurnSchedule | null
	cleanupDeadline: number | null
	disconnectedPlayers: Record<string, DisconnectInfo>
	connectionCount: number
	chronicle?: Chronicle
	forfeitedTribes?: Tribe[]
}

/**
 * Sealed discriminated union of domain events emitted by {@link step}. These
 * describe what *happened* in the state machine — they do not instruct the
 * runtime how to persist, wake up, or fan out messages. A {@link MatchHost}
 * adapter dispatches each variant to the matching method via
 * {@link runMatchCommand}.
 *
 * Adding a new variant **must** be accompanied by a new method on
 * {@link MatchHost} and a new `case` in the `runMatchCommand` orchestrator;
 * the trailing `default: const exhaustive: never = effect` guard turns any
 * miss into a compile error in every host.
 */
export type MatchEffect =
	/** Match state changed and should be re-projected to every connected tribe. */
	| { t: 'stateChanged' }
	/** Send a server message to a single tribe (action result, targeted error). */
	| { t: 'messageToTribe'; tribe: Tribe; msg: ServerMessage }
	/** Fan-out a server message to all connected tribes (turn timer, forfeit, …). */
	| { t: 'broadcast'; msg: ServerMessage }
	/** Match concluded; runtime should persist the result and notify clients. */
	| { t: 'gameEnded'; result: MatchResult }
	/** Match should be torn down and its storage released. */
	| { t: 'matchDestroyed' }
	/** Observability event for structured logging. */
	| { t: 'log'; event: string; data?: MatchLogData }
	/**
	 * Kick off an async bot turn in the host. The host awaits `runBotTurn`
	 * with the provided parameters and dispatches `{ kind: 'botTurnResolved' }`
	 * when complete. Keeps `step` pure — the async wait happens in the
	 * orchestrator, not the reducer. The orchestrator owns the abort controller
	 * (see `createMatchLogic`) so cancelled resolutions are dropped
	 * without touching `step`.
	 */
	| {
			t: 'awaitBotTurn'
			tribe: Tribe
			difficulty: Difficulty
			gameState: GameState
	  }

export type StepResult = {
	nextState: MatchState
	effects: MatchEffect[]
	/**
	 * Typed lifecycle facts (turn advanced, bot turn completed, game over, …)
	 * emitted alongside effects. Sibling stream — not a subset of
	 * {@link MatchEffect}. `createMatchLogic` calls `observer.onLifecycle(e)`
	 * for each after all effects have been interpreted.
	 */
	lifecycle: MatchLifecycleEvent[]
}

/**
 * Why a {@link MatchLogic.pump} loop terminated. The caller uses this to
 * decide whether to re-invoke (`cap-exhausted`), wait for external input
 * (`idle` / `blocked-on-human`), or stop (`game-over` / `destroyed` /
 * `predicate-met`).
 */
export type PumpReason =
	| 'persistence-failed'
	| 'idle'
	| 'blocked-on-human'
	| 'game-over'
	| 'cap-exhausted'
	| 'predicate-met'
	| 'destroyed'

export type PumpResult = {
	reason: PumpReason
	stepsTaken: number
	finalState: MatchState | null
}

export type PumpOptions = {
	/** Stop when this returns true. Evaluated before each step. */
	until?: (state: MatchState) => boolean
	/**
	 * Hard cap on internal command dispatches. Must be `>= 1`; the pump
	 * rejects `0` at runtime so callers can't disable the loop accidentally.
	 * Defaults to the pump's internal `MAX_BOT_TURNS_PER_ALARM` constant
	 * (see `logic.ts`) — matches the current onAlarm cap.
	 */
	maxSteps?: number
}
