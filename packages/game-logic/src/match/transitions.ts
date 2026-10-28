import { omitKey } from '../type-utils'
import { Result } from 'effect'
import { executeCommittedIntent } from '../action-execution'
import { type BotTurnRun } from '../bot/bot-turn'
import { type Tribe } from '../domains/tribe'
import { getCurrentPlayerState } from '../player/player-state'
import { advanceTurn as runTurnPipeline } from '../turns'
import { MatchId, PlayerId, Username } from '../ids'
import { type MatchResult } from '../multiplayer/types'
import { createGameWorld } from '../engine/world'

import { sealOutcome } from './outcome'
import { type MatchLifecycleEvent } from './ports'
import {
	appendChronicleEntries,
	emptyChronicle,
	truncateChronicle
} from './chronicle/chronicle'
import { type ChronicleEntry } from './chronicle/chronicle-entry'
import {
	CLEANUP_DELAY_MS,
	RECONNECT_GRACE_MS,
	type MatchEffect,
	type MatchCommand,
	type MatchState,
	type StepResult
} from './types'

/** Pure gameplay transformations selected by the command reducer. */
export function handlePerform(
	state: MatchState,
	cmd: Extract<MatchCommand, { kind: 'perform' }>,
	now: number
): StepResult {
	const result = executeCommittedIntent(state.gameState, cmd.tribe, cmd.intent)
	if (Result.isFailure(result)) {
		const isRuleViolation =
			result.failure._tag === 'GameOverError' ||
			result.failure._tag === 'NotYourTurnError'
		return {
			nextState: state,
			effects: [
				{
					t: 'messageToTribe',
					tribe: cmd.tribe,
					msg: isRuleViolation
						? { type: 'error', message: result.failure.message }
						: {
								type: 'actionResult',
								success: false,
								message: result.failure.message
							}
				}
			],
			lifecycle: [
				{
					t: 'commandRejected',
					tribe: cmd.tribe,
					kind: 'perform',
					reason: result.failure.message
				}
			]
		}
	}

	const afterAction = result.success
	let working: MatchState = {
		...state,
		gameState: afterAction.nextState
	}

	const effects: MatchEffect[] = [
		{
			t: 'messageToTribe',
			tribe: cmd.tribe,
			msg: {
				type: 'actionResult',
				success: true,
				message: afterAction.message
			}
		},
		{ t: 'stateChanged' }
	]

	const lifecycle: MatchLifecycleEvent[] = [
		{
			t: 'actionPerformed',
			tribe: cmd.tribe,
			intent: cmd.intent,
			message: afterAction.message
		}
	]
	if (afterAction.chronicleEntries.length > 0) {
		working = appendMatchChronicle(working, afterAction.chronicleEntries)
		effects.push({
			t: 'broadcast',
			msg: {
				type: 'chronicleEntries',
				entries: afterAction.chronicleEntries
			}
		})
		lifecycle.push({
			t: 'chronicleEntries',
			entries: afterAction.chronicleEntries
		})
	}

	const ended = sealMatchOutcome(working, now, state.gameState.isGameOver)
	working = ended.nextState
	effects.push(...ended.effects)
	lifecycle.push(...ended.lifecycle)

	return { nextState: working, effects, lifecycle }
}

export function handleEndTurn(
	state: MatchState,
	cmd: Extract<MatchCommand, { kind: 'endTurn' }>,
	now: number
): StepResult {
	if (state.gameState.isGameOver) {
		return {
			nextState: state,
			effects: [
				{
					t: 'messageToTribe',
					tribe: cmd.tribe,
					msg: { type: 'error', message: 'Game is over' }
				}
			],
			lifecycle: [
				{
					t: 'commandRejected',
					tribe: cmd.tribe,
					kind: 'endTurn',
					reason: 'Game is over'
				}
			]
		}
	}

	if (cmd.tribe !== state.gameState.currentPlayerTribe) {
		return {
			nextState: state,
			effects: [
				{
					t: 'messageToTribe',
					tribe: cmd.tribe,
					msg: { type: 'error', message: 'Not your turn' }
				}
			],
			lifecycle: [
				{
					t: 'commandRejected',
					tribe: cmd.tribe,
					kind: 'endTurn',
					reason: 'Not your turn'
				}
			]
		}
	}

	return advanceTurn(state, now)
}

export function advanceTurn(state: MatchState, now: number): StepResult {
	const wasGameOver = state.gameState.isGameOver
	const advance = runTurnPipeline(state.gameState)
	let working: MatchState = {
		...state,
		gameState: advance.state
	}
	const effects: MatchEffect[] = [{ t: 'stateChanged' }]
	if (advance.events.length > 0) {
		effects.push({
			t: 'broadcast',
			msg: { type: 'turnEvents', events: advance.events }
		})
	}
	const lifecycle: MatchLifecycleEvent[] = []
	if (advance.chronicleEntries.length > 0) {
		working = appendMatchChronicle(working, advance.chronicleEntries)
		effects.push({
			t: 'broadcast',
			msg: {
				type: 'chronicleEntries',
				entries: advance.chronicleEntries
			}
		})
		lifecycle.push({
			t: 'chronicleEntries',
			entries: advance.chronicleEntries
		})
	}
	// `gameOver` is emitted from `sealMatchOutcome` — the sole source. It
	// gets `wasGameOver` (as measured at the start of this step) so it can
	// detect the ongoing→ended transition even when `runTurnPipeline`
	// already set `isGameOver` via its `gameOverPhase`.
	return scheduleAfterTurnChange(working, now, effects, lifecycle, wasGameOver)
}

/**
 * Trigger a bot turn. The durable wake remains available for host recovery;
 * an `awaitBotTurn` effect asks the host to run the async
 * `runBotTurn` and dispatches `botTurnResolved` with the result — which
 * lands in {@link handleBotTurnResolved}.
 */
export function handleRunBotTurn(state: MatchState): StepResult {
	if (state.gameState.isGameOver || state.execution === 'bot-running') {
		return {
			nextState: state,
			effects: [],
			lifecycle: []
		}
	}
	const bot = getCurrentPlayerState(
		state.gameState.playerStates,
		state.gameState.currentPlayerTribe
	)
	if (!bot.isBot) {
		return {
			nextState:
				state.turnSchedule?.kind === 'bot'
					? { ...state, turnSchedule: null }
					: state,
			effects: [],
			lifecycle: []
		}
	}
	// Keep the absolute wake durable while computation is in flight. A restored
	// host retries the deterministic bot turn from this committed state.
	const cleared: MatchState = { ...state, execution: 'bot-running' }
	return {
		nextState: cleared,
		effects: [
			{
				t: 'awaitBotTurn',
				tribe: bot.tribe,
				difficulty: bot.difficulty,
				gameState: cleared.gameState
			}
		],
		lifecycle: [
			{ t: 'botTurnStarted', tribe: bot.tribe, turn: state.gameState.turn }
		]
	}
}

/**
 * Fold a resolved bot turn back into match state. Emits a `stateChanged`
 * effect per intermediate + final state, logs a `bot_turn_error` if the run
 * carried one, and re-arms the scheduler via {@link scheduleAfterTurnChange}.
 */
export function handleBotTurnResolved(
	state: MatchState,
	tribe: Tribe,
	run: BotTurnRun,
	now: number,
	baseGameState?: MatchState['gameState']
): StepResult {
	const wasGameOver = state.gameState.isGameOver
	// Guard against stale resolutions (e.g. a forfeit landed while the bot
	// was computing, rotating the current tribe). The logic-layer epoch
	// guard catches destroyed/reinit cases; this catches the narrower
	// tribe-mismatch window. Emits a terminal `botTurnFailed` lifecycle so
	// the `started == completed + failed` observer invariant holds even in
	// race windows.
	if (
		state.gameState.currentPlayerTribe !== tribe ||
		state.gameState.isGameOver ||
		(baseGameState !== undefined && baseGameState !== state.gameState)
	) {
		return {
			nextState: state,
			effects: [
				{
					t: 'log',
					event: 'bot_turn_stale',
					data: {
						resolvedTribe: tribe,
						currentTribe: state.gameState.currentPlayerTribe
					}
				}
			],
			lifecycle: [
				{
					t: 'botTurnFailed',
					tribe,
					turn: state.gameState.turn,
					reason:
						state.gameState.currentPlayerTribe === tribe
							? 'stale_state'
							: 'stale_tribe'
				}
			]
		}
	}

	const working: MatchState = { ...state, gameState: run.finalState }
	const effects: MatchEffect[] = []
	const lifecycle: MatchLifecycleEvent[] = []

	if (run.error) {
		effects.push({
			t: 'log',
			event: 'bot_turn_error',
			data: {
				tribe: run.error.tribe,
				turn: run.error.turn,
				message: run.error.message
			}
		})
		lifecycle.push({
			t: 'botTurnFailed',
			tribe: run.error.tribe,
			turn: run.error.turn,
			reason: run.error.message
		})
	} else {
		lifecycle.push({
			t: 'botTurnCompleted',
			tribe,
			turn: state.gameState.turn,
			actionCount: run.intermediateStates.length
		})
	}

	// Preserve one notification per successful bot action, followed by the final state.
	run.intermediateStates.forEach(() => {
		effects.push({ t: 'stateChanged' })
	})
	effects.push({ t: 'stateChanged' })

	// `gameOver` emission is handled by `sealMatchOutcome` inside
	// `scheduleAfterTurnChange`. `runBotTurn` may have sealed `finalState`
	// via `advanceTurn` already, so we pass `wasGameOver` captured before
	// any state mutation — one emission source for the whole pipeline.
	return scheduleAfterTurnChange(working, now, effects, lifecycle, wasGameOver)
}

function scheduleAfterTurnChange(
	state: MatchState,
	now: number,
	effects: MatchEffect[],
	lifecycle: MatchLifecycleEvent[],
	wasGameOver: boolean
): StepResult {
	const ended = sealMatchOutcome(state, now, wasGameOver)
	let working = ended.nextState
	effects.push(...ended.effects)
	lifecycle.push(...ended.lifecycle)

	if (working.gameState.isGameOver) {
		working = { ...working, turnSchedule: null }
		return { nextState: working, effects, lifecycle }
	}

	const currentPlayer = getCurrentPlayerState(
		working.gameState.playerStates,
		working.gameState.currentPlayerTribe
	)
	const isBot = currentPlayer.isBot

	effects.push({
		t: 'log',
		event: 'turn_advanced',
		data: {
			tribe: working.gameState.currentPlayerTribe,
			turn: working.gameState.turn,
			isBot
		}
	})
	lifecycle.push({
		t: 'turnAdvanced',
		turn: working.gameState.turn,
		tribe: working.gameState.currentPlayerTribe,
		isBot
	})

	if (!currentPlayer.isBot) {
		working = startTurnTimer(working, now)
		if (working.turnSchedule !== null) {
			effects.push({
				t: 'broadcast',
				msg: {
					type: 'turnTimerUpdate',
					turnEndsAt: working.turnSchedule.deadline
				}
			})
		}
		return { nextState: working, effects, lifecycle }
	}

	working = { ...working, turnSchedule: { kind: 'bot', deadline: now } }
	return { nextState: working, effects, lifecycle }
}

export function handleForfeit(
	input: MatchState,
	tribe: Tribe,
	username: string,
	now: number,
	disconnectedPlayerId?: string
): StepResult {
	const state =
		disconnectedPlayerId === undefined
			? input
			: {
					...input,
					disconnectedPlayers: omitKey(
						input.disconnectedPlayers,
						disconnectedPlayerId
					)
				}
	if (state.gameState.isGameOver) {
		return { nextState: state, effects: [], lifecycle: [] }
	}
	if (state.gameState.eliminatedTribes.includes(tribe)) {
		return { nextState: state, effects: [], lifecycle: [] }
	}

	const world = createGameWorld(state.gameState)
	world.updateMetadata({
		eliminatedTribes: [...state.gameState.eliminatedTribes, tribe]
	})
	let working: MatchState = {
		...state,
		gameState: world.snapshot(),
		forfeitedTribes: (state.forfeitedTribes ?? []).includes(tribe)
			? (state.forfeitedTribes ?? [])
			: [...(state.forfeitedTribes ?? []), tribe]
	}

	const effects: MatchEffect[] = [
		{
			t: 'log',
			event: 'player_forfeited',
			data: { username, tribe }
		},
		{
			t: 'broadcast',
			msg: { type: 'playerForfeited', tribe, username }
		}
	]
	const lifecycle: MatchLifecycleEvent[] = []

	if (working.gameState.currentPlayerTribe === tribe) {
		const advanced = advanceTurn(working, now)
		working = advanced.nextState
		effects.push(...advanced.effects)
		lifecycle.push(...advanced.lifecycle)
	} else {
		effects.push({ t: 'stateChanged' })
		// Pre-step `isGameOver` is false — the forfeit guard above returned
		// early if the game was already over, so sealMatchOutcome here owns
		// any ongoing→ended transition caused by the forfeit.
		const ended = sealMatchOutcome(working, now, false)
		working = ended.nextState
		effects.push(...ended.effects)
		lifecycle.push(...ended.lifecycle)
	}

	if (
		!working.gameState.isGameOver &&
		working.connectionCount === 0 &&
		Object.keys(working.disconnectedPlayers).length === 0 &&
		!working.cleanupDeadline
	) {
		working = { ...working, cleanupDeadline: now + CLEANUP_DELAY_MS }
	}

	return { nextState: working, effects, lifecycle }
}

export function handlePlayerDisconnected(
	state: MatchState,
	cmd: Extract<MatchCommand, { kind: 'playerDisconnected' }>,
	now: number
): StepResult {
	const postConn: MatchState = {
		...state,
		connectionCount: Math.max(0, state.connectionCount - 1)
	}

	if (postConn.gameState.isGameOver) {
		return { nextState: postConn, effects: [], lifecycle: [] }
	}
	if (postConn.gameState.eliminatedTribes.includes(cmd.tribe)) {
		return { nextState: postConn, effects: [], lifecycle: [] }
	}

	const deadline = now + RECONNECT_GRACE_MS
	let working: MatchState = {
		...postConn,
		disconnectedPlayers: {
			...postConn.disconnectedPlayers,
			[cmd.playerId]: {
				tribe: cmd.tribe,
				username: cmd.username,
				deadline
			}
		}
	}

	if (
		working.gameState.currentPlayerTribe === cmd.tribe &&
		!working.turnSchedule
	) {
		working = {
			...working,
			turnSchedule: { kind: 'human', deadline }
		}
	}

	const effects: MatchEffect[] = [
		{
			t: 'broadcast',
			msg: {
				type: 'error',
				message: `${cmd.username} disconnected — they have 60s to reconnect`
			}
		}
	]

	return { nextState: working, effects, lifecycle: [] }
}

export function handlePlayerReconnected(
	state: MatchState,
	cmd: Extract<MatchCommand, { kind: 'playerReconnected' }>
): StepResult {
	if (!state.disconnectedPlayers[cmd.playerId]) {
		return { nextState: state, effects: [], lifecycle: [] }
	}

	const rest = omitKey(state.disconnectedPlayers, cmd.playerId)
	const working: MatchState = {
		...state,
		disconnectedPlayers: rest
	}

	return { nextState: working, effects: [], lifecycle: [] }
}

export function handleCleanup(state: MatchState, now: number): StepResult {
	if (
		state.connectionCount > 0 ||
		(!state.gameState.isGameOver &&
			Object.keys(state.disconnectedPlayers).length > 0)
	) {
		return { nextState: state, effects: [], lifecycle: [] }
	}
	return {
		nextState:
			state.execution === 'cleanup-pending'
				? state
				: {
						...state,
						execution: 'cleanup-pending',
						turnSchedule: null,
						cleanupDeadline: now
					},
		effects: [{ t: 'matchDestroyed' }],
		lifecycle: []
	}
}

/**
 * Seals the match outcome and, on the ongoing → ended transition, emits the
 * observability + runtime effects (cleanup scheduling, match result payload)
 * plus the `gameOver` lifecycle event. `preStepGameOver` is the
 * `state.gameState.isGameOver` at the start of the current step — it lets
 * this function detect transitions even when an upstream phase (the turn
 * pipeline's `gameOverPhase`, `runBotTurn`'s internal `advanceTurn`) has
 * already baked the flag into `state.gameState`.
 *
 * Safe to call on an already-ended state — returns the input unchanged.
 */
function sealMatchOutcome(
	state: MatchState,
	now: number,
	preStepGameOver: boolean
): StepResult {
	const sealed = sealOutcome(state.gameState)
	if (!sealed.isGameOver || preStepGameOver) {
		return { nextState: state, effects: [], lifecycle: [] }
	}

	const working: MatchState = {
		...state,
		gameState: sealed,
		turnSchedule: null,
		cleanupDeadline: now + CLEANUP_DELAY_MS
	}

	const effects: MatchEffect[] = [
		{
			t: 'log',
			event: 'game_ended',
			data: { winner: sealed.winner, turn: sealed.turn }
		},
		{ t: 'gameEnded', result: buildMatchResult(working, now) }
	]

	const lifecycle: MatchLifecycleEvent[] = [
		{ t: 'gameOver', winner: sealed.winner, turn: sealed.turn }
	]

	return { nextState: working, effects, lifecycle }
}

function startTurnTimer(state: MatchState, now: number): MatchState {
	if (!state.config.turnTimerSeconds) {
		return { ...state, turnSchedule: null }
	}
	return {
		...state,
		turnSchedule: {
			kind: 'human',
			deadline: now + state.config.turnTimerSeconds * 1000
		}
	}
}

/**
 * Earliest deadline across all scheduled timers on a MatchState.
 * Exported so the logic layer can arm its scheduler after each step.
 */
export function computeAlarm(state: MatchState): number | null {
	if (state.gameState.isGameOver) {
		// The last connection closing recalculates the alarm when cleanup can run.
		return state.connectionCount === 0 ? state.cleanupDeadline : null
	}
	const deadlines: number[] = []
	if (state.turnSchedule) {
		deadlines.push(state.turnSchedule.deadline)
	}
	if (state.cleanupDeadline) {
		deadlines.push(state.cleanupDeadline)
	}
	for (const info of Object.values(state.disconnectedPlayers)) {
		deadlines.push(info.deadline)
	}
	if (deadlines.length === 0) {
		return null
	}
	return Math.min(...deadlines)
}

function buildMatchResult(state: MatchState, now: number): MatchResult {
	const duration = Math.floor((now - state.startedAt) / 1000)
	return {
		matchId: MatchId.make(state.matchId),
		winner: state.gameState.winner,
		players: state.config.players.map((p) => ({
			playerId: PlayerId.make(p.playerId),
			username: Username.make(p.username),
			tribe: p.tribe,
			isBot: p.isBot
		})),
		duration,
		turnCount: state.gameState.turn,
		mapSize: state.config.mapSize,
		completedAt: new Date(now).toISOString()
	}
}

function appendMatchChronicle(
	state: MatchState,
	entries: readonly ChronicleEntry[]
): MatchState {
	return {
		...state,
		chronicle: truncateChronicle(
			appendChronicleEntries(state.chronicle ?? emptyChronicle, entries),
			200
		)
	}
}
