import { isWaterTerrain, type TileTerrain } from '../tile/tile-terrain'
import {
	isHeroUnitType,
	unitToUnitStats,
	type HeroUnitType,
	type UnitType
} from '../domains/unit'

const counterAttack: Record<Exclude<UnitType, HeroUnitType>, number> = {
	caveman: 9,
	archer: 8,
	guard: 16,
	spearman: 14,
	seer: 10,
	sprinter: 10,
	mage: 4,
	swordsman: 14,
	bombardier: 6,
	tidebreaker: 9
}

/** Counter strength is independent of forward attack. Heroes retain their balance. */
export function getCounterAttack(type: UnitType, terrain: TileTerrain): number {
	if (isWaterTerrain(terrain)) {
		if (type === 'bombardier') {
			return 10
		}
		if (type === 'tidebreaker') {
			return 14
		}
		return 6
	}
	return isHeroUnitType(type)
		? unitToUnitStats[type].attack
		: counterAttack[type]
}
