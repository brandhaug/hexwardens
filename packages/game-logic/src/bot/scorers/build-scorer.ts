import { isPrimaryBuildingValue } from '../../domains/primary-building'
import { canAfford } from '../../validation/player'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_BUILD_SCORE = 30

/**
 * Score building actions (primary and secondary).
 */
export function scoreBuildActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []

	if (!canAfford(fixture.playerState, 5)) {
		return actions
	}

	const { board, villageRange, tribe } = fixture

	for (const [position, tile] of board.entries()) {
		if (!villageRange.has(board.key(position))) {
			continue
		}

		if (tile.item?.type === 'primaryBuilding' && tile.item.state === 'idle') {
			actions.push({
				kind: 'build',
				score: BASE_BUILD_SCORE,
				execute: () => ({
					kind: 'tileAction',
					action: { kind: 'build', at: position }
				})
			})
		}

		if (!tile.item && !tile.unit) {
			const hasAdjacentBuiltPrimary = board
				.neighborsOf(position)
				.some((nPos) => {
					const nTile = board.at(nPos)
					return (
						nTile?.item?.type === 'primaryBuilding' &&
						nTile.item.state === 'built' &&
						nTile.item.tribe === tribe &&
						isPrimaryBuildingValue(nTile.item.value)
					)
				})

			if (hasAdjacentBuiltPrimary) {
				actions.push({
					kind: 'build',
					score: BASE_BUILD_SCORE - 5,
					execute: () => ({
						kind: 'tileAction',
						action: { kind: 'build', at: position }
					})
				})
			}
		}
	}

	return actions
}
