import { type FogProjectionError } from '../fog-of-war/errors'
import { Result } from 'effect'
import { type Tribe } from '../domains/tribe'
import { snapshotFor } from '../fog-of-war/snapshot'
import { type ServerMessage } from '../multiplayer/types'
import { type MatchState } from './types'

export type GameStateMessage = Extract<ServerMessage, { type: 'gameState' }>

export function buildGameStateMessage(
	matchState: MatchState,
	tribe: Tribe
): Result.Result<GameStateMessage, FogProjectionError> {
	const projected = snapshotFor(matchState.gameState, tribe).projected
	if (Result.isFailure(projected)) {
		return Result.fail(projected.failure)
	}
	return Result.succeed({
		type: 'gameState',
		state: projected.success,
		currentTurn: matchState.gameState.currentPlayerTribe,
		turnEndsAt:
			matchState.turnSchedule?.kind === 'human'
				? matchState.turnSchedule.deadline
				: null,
		viewer: tribe
	})
}
