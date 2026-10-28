import { type BoardPosition } from '../../board/board'
import { tribeToTribeStats } from '../../domains/tribe'
import {
	generalUnitTypes,
	unitToUnitStats,
	type UnitType
} from '../../domains/unit'
import { canAfford, hasTechRequirement } from '../../validation/player'
import { type ScoredAction } from '../score-context'
import { type ScoringFixture } from '../scoring-fixture'

const BASE_TRAIN_SCORE = 60

/**
 * Score unit training actions at friendly villages. Hero units are NOT
 * considered here — heroes are summoned via the level-5 `special_unit`
 * Village Perk (see {@link scorePerkActions}).
 */
export function scoreTrainActions(fixture: ScoringFixture): ScoredAction[] {
	const actions: ScoredAction[] = []
	const { playerState, tribe, positionalAwareness } = fixture
	if (!playerState) {
		return actions
	}

	const tribeStats = tribeToTribeStats[tribe]
	const availableUnitTypes = new Set<UnitType>()

	for (const unit of [tribeStats.primaryUnit, tribeStats.secondaryUnit]) {
		if (!unit) {
			continue
		}
		const stats = unitToUnitStats[unit]
		if (hasTechRequirement(playerState, stats.requiredTech)) {
			availableUnitTypes.add(unit)
		}
	}

	for (const unitType of generalUnitTypes) {
		const stats = unitToUnitStats[unitType]
		if (hasTechRequirement(playerState, stats.requiredTech)) {
			availableUnitTypes.add(unitType)
		}
	}

	const trainableVillages = fixture.candidateTiles((_, tile) => {
		if (tile.item?.type !== 'village') {
			return false
		}
		if (tile.item.tribe !== tribe) {
			return false
		}
		if (tile.unit) {
			return false
		}
		if (tile.item.population >= tile.item.maxPopulation) {
			return false
		}
		return true
	})

	for (const [position] of trainableVillages) {
		for (const unitType of availableUnitTypes) {
			const unitStats = unitToUnitStats[unitType]
			if (!canAfford(playerState, unitStats.cost)) {
				continue
			}

			let score = BASE_TRAIN_SCORE

			if (positionalAwareness) {
				if (playerState.money <= 5) {
					score += (4 - unitStats.cost) * 5
				}

				if (unitType === 'seer' || unitType === 'sprinter') {
					const nearestEnemy = fixture.distanceToNearestEnemyVillage(position)
					if (nearestEnemy > 4) {
						score += 10
					}
				}

				if (unitType === 'guard' || unitType === 'spearman') {
					const nearbyThreats = countNearbyEnemyUnits(position, fixture, 3)
					if (nearbyThreats > 0) {
						score += 15
					}
				}
			}

			score += (4 - unitStats.cost) * 2

			actions.push({
				kind: 'train',
				score,
				execute: () => ({
					kind: 'tileAction',
					action: { kind: 'train', at: position, unit: unitType }
				})
			})
		}
	}

	return actions
}

function countNearbyEnemyUnits(
	position: BoardPosition,
	fixture: ScoringFixture,
	range: number
): number {
	return fixture.enemiesWithin(position, range).length
}
