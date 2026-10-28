import { getCurrentPlayerState } from '../player/player-state'
import { assertNever } from '../type-utils'
import {
	advanceTurn,
	handleBotTurnResolved,
	handleCleanup,
	handleEndTurn,
	handleForfeit,
	handlePerform,
	handlePlayerDisconnected,
	handlePlayerReconnected,
	handleRunBotTurn
} from './transitions'
import { type MatchCommand, type MatchState, type StepResult } from './types'

export { computeAlarm } from './transitions'

const unchanged = (state: MatchState): StepResult => ({
	nextState: state,
	effects: [],
	lifecycle: []
})

function clearExecution(state: MatchState): MatchState {
	const next = { ...state }
	delete next.execution
	return next
}

/** Pure command routing shared by production hosts and transition tests. */
export function step(
	state: MatchState,
	command: MatchCommand,
	now: number
): StepResult {
	if (state.execution === 'cleanup-pending') {
		return command.kind === 'cleanup'
			? handleCleanup(state, now)
			: unchanged(state)
	}
	const result = routeCommand(state, command, now)
	// A gameplay change invalidates the old bot run. The host also checks its
	// captured game reference before accepting a late result.
	if (
		result.nextState.gameState !== state.gameState &&
		result.nextState.execution === 'bot-running'
	) {
		return { ...result, nextState: clearExecution(result.nextState) }
	}
	return result
}

function routeCommand(
	state: MatchState,
	command: MatchCommand,
	now: number
): StepResult {
	switch (command.kind) {
		case 'hostResumed': {
			return state.execution === 'bot-running'
				? unchanged(clearExecution(state))
				: unchanged(state)
		}
		case 'perform': {
			return handlePerform(state, command, now)
		}
		case 'endTurn': {
			return handleEndTurn(state, command, now)
		}
		case 'forfeit': {
			return handleForfeit(
				state,
				command.tribe,
				command.username,
				now,
				command.disconnectedPlayerId
			)
		}
		case 'turnTimeout': {
			const current = getCurrentPlayerState(
				state.gameState.playerStates,
				state.gameState.currentPlayerTribe
			)
			return state.gameState.isGameOver || current.isBot
				? unchanged(state)
				: advanceTurn({ ...state, turnSchedule: null }, now)
		}
		case 'runBotTurn': {
			return handleRunBotTurn(state)
		}
		case 'botTurnResolved': {
			return handleBotTurnResolved(
				state,
				command.tribe,
				command.run,
				now,
				command.baseGameState
			)
		}
		case 'playerDisconnected': {
			return handlePlayerDisconnected(state, command, now)
		}
		case 'playerReconnected': {
			return handlePlayerReconnected(state, command)
		}
		case 'connectionOpened': {
			return unchanged({
				...handlePlayerReconnected(state, {
					kind: 'playerReconnected',
					playerId: command.playerId
				}).nextState,
				connectionCount: state.connectionCount + 1
			})
		}
		case 'connectionClosed': {
			return unchanged({
				...state,
				connectionCount: Math.max(0, state.connectionCount - 1)
			})
		}
		case 'cleanup': {
			return handleCleanup(state, now)
		}
		default: {
			return assertNever(command)
		}
	}
}
