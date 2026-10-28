import { type MatchCommand, type MatchState, type PumpResult } from './types'

export function blockedReasonFor(state: MatchState): PumpResult['reason'] {
	return state.turnSchedule?.kind === 'human' ||
		Object.keys(state.disconnectedPlayers).length > 0
		? 'blocked-on-human'
		: 'idle'
}

export function pickDueCommand(
	state: MatchState,
	now: number
): MatchCommand[] | null {
	if (state.gameState.isGameOver) {
		return state.connectionCount === 0 &&
			state.cleanupDeadline !== null &&
			now >= state.cleanupDeadline
			? [{ kind: 'cleanup' }]
			: null
	}
	for (const [playerId, info] of Object.entries(state.disconnectedPlayers)) {
		if (now >= info.deadline) {
			return [
				{
					kind: 'forfeit',
					tribe: info.tribe,
					username: info.username,
					disconnectedPlayerId: playerId
				}
			]
		}
	}
	if (
		state.turnSchedule?.kind === 'human' &&
		now >= state.turnSchedule.deadline
	) {
		return [{ kind: 'turnTimeout' }]
	}
	if (
		state.turnSchedule?.kind === 'bot' &&
		now >= state.turnSchedule.deadline
	) {
		return [{ kind: 'runBotTurn' }]
	}
	if (state.cleanupDeadline !== null && now >= state.cleanupDeadline) {
		return [{ kind: 'cleanup' }]
	}
	return null
}
