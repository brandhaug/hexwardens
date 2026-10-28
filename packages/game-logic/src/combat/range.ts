import { Grid, type Hex } from 'honeycomb-grid'
import { type BoardPosition } from '../board/board'
import { hasTechPassive, type Tech } from '../domains/tech'
import {
	getEffectiveUnitStatsForTerrain,
	unitToUnitStats,
	type Unit,
	type UnitType
} from '../domains/unit'
import { type TileTerrain } from '../tile/tile-terrain'

export function getEffectiveRangeWithTech(
	unitType: UnitType,
	researchedTechs: readonly Tech[],
	terrain?: TileTerrain
): number {
	const stats = terrain
		? getEffectiveUnitStatsForTerrain(unitType, terrain)
		: unitToUnitStats[unitType]
	let range = stats.range
	if (range > 1 && hasTechPassive(researchedTechs, 'ranged_bonus')) {
		range += 1
	}
	if (
		unitType === 'mage' &&
		hasTechPassive(researchedTechs, 'engineering_bonus')
	) {
		range += 1
	}
	return range
}

export function hexDistance(
	a: BoardPosition,
	b: BoardPosition,
	gameHex: typeof Hex,
	radius: number
): number {
	const aQ = a.q_idx - radius
	const aR = a.r_idx - radius
	const bQ = b.q_idx - radius
	const bR = b.r_idx - radius
	const hexA = new gameHex([aQ, aR])
	const hexB = new gameHex([bQ, bR])
	const grid = new Grid(gameHex, [hexA, hexB])
	return grid.distance([aQ, aR], [bQ, bR]) || 0
}

export function canAttack(
	attackerUnit: Unit,
	attackerPos: BoardPosition,
	targetUnit: Unit | null,
	targetPos: BoardPosition,
	gameHex: typeof Hex,
	radius: number,
	researchedTechs: readonly Tech[],
	attackerTerrain?: TileTerrain
): boolean {
	if (!targetUnit) {
		return false
	}
	if (attackerUnit.tribe === targetUnit.tribe) {
		return false
	}
	const attackRange = getEffectiveRangeWithTech(
		attackerUnit.type,
		researchedTechs,
		attackerTerrain
	)
	const distance = hexDistance(attackerPos, targetPos, gameHex, radius)
	return distance <= attackRange
}
