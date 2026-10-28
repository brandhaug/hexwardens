import { Result } from 'effect'
import { type Hex } from 'honeycomb-grid'
import { Board, canMoveTo, type BoardPosition } from '../board/board'
import { executeMovement } from '../units/world-movement'
import { canAttack } from '../combat/range'
import { type Tribe } from '../domains/tribe'
import { type UnitId } from '../domains/unit'
import { type GameState } from '../game'
import { canUnitMove } from '../validation/unit'
import { getMinDistance, isWithinAnyVillageRange } from './bot-move-helpers'
import { type ScoredAction } from './score-context'
import { type ScoringFixture } from './scoring-fixture'

const BASE_MOVE_SCORE = 10

/**
 * Score movement actions with optimistic 1-turn lookahead.
 * Simulates what the bot could do AFTER moving (attack, capture)
 * to better evaluate positional value.
 */
export function scoreMoveLookaheadActions(
	fixture: ScoringFixture
): ScoredAction[] {
	const actions: ScoredAction[] = []
	const {
		gameState,
		tribe,
		gameHex,
		radius,
		board,
		enemyVillages,
		friendlyVillages
	} = fixture

	for (const friendly of fixture.friendlyUnits) {
		if (!canUnitMove(friendly.state)) {
			continue
		}

		const unitPos = friendly.position
		const { unit } = friendly

		for (const [targetPos, targetTile] of board.entries()) {
			const targetItem = targetTile.item
			if (targetTile.unit) {
				continue
			}
			if (
				targetPos.q_idx === unitPos.q_idx &&
				targetPos.r_idx === unitPos.r_idx
			) {
				continue
			}

			if (Result.isFailure(canMoveTo(gameState, unitPos, targetPos))) {
				continue
			}

			let score = BASE_MOVE_SCORE

			if (enemyVillages.length > 0) {
				const currentMinDist = getMinDistance(unitPos, enemyVillages, board)
				const newMinDist = getMinDistance(targetPos, enemyVillages, board)
				score += (currentMinDist - newMinDist) * 15
			}

			const moveResult = executeMovement(gameState, unitPos, targetPos)

			if (Result.isSuccess(moveResult)) {
				const futureState = moveResult.success.newGameState
				const futureScore = evaluateFutureActions(
					futureState,
					targetPos,
					unit.id,
					tribe,
					gameHex,
					radius
				)
				score += futureScore
			}

			if (
				targetItem?.type === 'village' &&
				targetItem.tribe !== tribe &&
				targetItem.tribe !== null
			) {
				score += 80
			}

			if (targetItem?.type === 'ruins') {
				score += 12
			}

			if (targetItem?.type === 'resource') {
				if (isWithinAnyVillageRange(targetPos, friendlyVillages, board)) {
					score += 8
				}
			}

			const unitId = unit.id
			actions.push({
				kind: 'move',
				score,
				execute: () => ({
					kind: 'move',
					unitId,
					from: unitPos,
					to: targetPos
				})
			})
		}
	}

	return actions
}

function evaluateFutureActions(
	futureState: GameState,
	unitPos: BoardPosition,
	unitId: UnitId,
	tribe: Tribe,
	gameHex: typeof Hex,
	radius: number
): number {
	let bonus = 0

	const board = Board.from(futureState.units.board)
	const unitTile = board.at(unitPos)
	if (!unitTile?.unit) {
		return 0
	}

	const unit = unitTile.unit
	const unitState = futureState.units.unitStates[unitId]
	if (!unitState) {
		return 0
	}

	if (unit.stats.canAttackAfterMove) {
		for (const [targetPos, tile] of board.entries()) {
			const enemy = tile.unit
			if (!enemy || enemy.tribe === tribe) {
				continue
			}
			if (
				canAttack(
					unit,
					unitPos,
					enemy,
					targetPos,
					gameHex,
					radius,
					futureState.playerStates[tribe]?.researchedTechs ?? [],
					unitTile.terrain
				)
			) {
				bonus = Math.max(bonus, 40)
			}
		}
	}

	if (
		unitTile.item?.type === 'village' &&
		unitTile.item.tribe !== tribe &&
		unitTile.item.tribe !== null
	) {
		if (unit.stats.canCaptureAfterMove) {
			bonus = Math.max(bonus, 80)
		}
	}

	return bonus
}
