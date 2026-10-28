import { Result } from 'effect'
import { canMoveTo, type BoardPosition, type Board } from '../../board/board'
import { canUnitMove } from '../../validation/unit'
import { isWithinAnyVillageRange } from '../bot-move-helpers'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_MOVE_SCORE = 10

/**
 * Score movement actions for all units with an available move.
 * Prioritizes moving toward enemy villages (aggression-first).
 */
export function scoreMoveActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []
	const {
		gameState,
		tribe,
		board,
		positionalAwareness,
		enemyVillages,
		friendlyVillages,
		enemyUnits
	} = fixture

	const nearbyEnemyCount =
		positionalAwareness && friendlyVillages.length > 0
			? countEnemiesNearVillages(friendlyVillages, enemyUnits, board, 3)
			: 0

	for (const friendly of fixture.friendlyUnits) {
		if (!canUnitMove(friendly.state)) {
			continue
		}

		const unitPos = friendly.position
		const { unit } = friendly

		// Hoist per-unit-position distances out of the per-target loop. The
		// source position is constant for all candidate targets of this unit,
		// so recomputing it inside the inner loop wastes O(targets × villages)
		// distance lookups. Both queries are memoized in the fixture too, so
		// subsequent units that share a starting tile pay nothing.
		const currentMinDist =
			enemyVillages.length > 0
				? fixture.distanceToNearestEnemyVillage(unitPos)
				: Infinity
		const currentDefDist =
			positionalAwareness && friendlyVillages.length > 0
				? fixture.distanceToNearestFriendlyVillage(unitPos)
				: Infinity

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
				const newMinDist = fixture.distanceToNearestEnemyVillage(targetPos)
				score += (currentMinDist - newMinDist) * 15
			}

			if (positionalAwareness) {
				if (
					targetItem?.type === 'resource' &&
					isWithinAnyVillageRange(targetPos, friendlyVillages, board)
				) {
					score += 8
				}

				if (targetItem?.type === 'ruins') {
					score += 12
				}

				if (
					targetItem?.type === 'village' &&
					targetItem.tribe !== tribe &&
					targetItem.tribe !== null
				) {
					score += 80
				}

				if (nearbyEnemyCount > 0) {
					const newDefDist = fixture.distanceToNearestFriendlyVillage(targetPos)
					if (newDefDist > currentDefDist && currentDefDist <= 3) {
						score -= 10
					}
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

function countEnemiesNearVillages(
	villages: readonly BoardPosition[],
	enemyUnits: readonly { position: BoardPosition }[],
	board: Board,
	range: number
): number {
	let count = 0
	for (const enemy of enemyUnits) {
		for (const vPos of villages) {
			if (board.distance(enemy.position, vPos) <= range) {
				count++
				break
			}
		}
	}
	return count
}
