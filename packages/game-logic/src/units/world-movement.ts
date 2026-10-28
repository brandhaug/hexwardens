import { Result } from 'effect'
import { canMoveTo, type BoardPosition } from '../board/board'
import { type ActionResult } from '../actions/actions'
import { type GameState } from '../game'
import { createGameWorld } from '../engine/world'
import {
	InvalidTargetError,
	type GameActionError
} from '../actions/action-errors'
import { type GameWorld } from '../engine/world-contract'

/** Immutable adapter for bot lookahead and compatibility callers. */
export function executeMovement(
	gameState: GameState,
	fromPos: BoardPosition,
	toPos: BoardPosition
): ActionResult {
	const world = createGameWorld(gameState)
	return Result.map(moveWorldUnit(world, fromPos, toPos), (message) => ({
		newGameState: world.snapshot(),
		message
	}))
}

export function moveWorldUnit(
	world: GameWorld,
	from: BoardPosition,
	to: BoardPosition
): Result.Result<string, GameActionError> {
	const legal = canMoveTo(world.snapshot(), from, to)
	if (Result.isFailure(legal)) {
		return Result.fail(legal.failure)
	}
	const unit = world.tile(from)?.unit
	if (!unit) {
		return Result.fail(
			new InvalidTargetError({ message: 'No unit at source position' })
		)
	}
	const mode = world.unit(unit.id)?.state.mode
	world.moveUnit(unit.id, to)
	world.updateUnit(unit.id, { mode: mode === 'retreat' ? 'acted' : 'moved' })
	return Result.succeed(
		`Moved ${unit.type} from (${from.q_idx}, ${from.r_idx}) to (${to.q_idx}, ${to.r_idx})`
	)
}
