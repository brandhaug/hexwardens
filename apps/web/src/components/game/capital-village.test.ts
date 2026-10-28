import { describe, expect, it } from 'vite-plus/test'
import { isCapitalVillage } from '@/components/game/capital-village'
import {
	createVillage,
	type VillageLevel
} from '@hexwardens/game-logic/domains/village'
import { type TileItem } from '@hexwardens/game-logic/tile/tile-item'

const villageItem = (overrides: {
	tribe?: 'barbarians' | null
	level?: VillageLevel
}): TileItem => ({
	...createVillage(1),
	state: 'built',
	level: overrides.level ?? 1,
	tribe: overrides.tribe ?? null
})

describe('isCapitalVillage', () => {
	it('returns false for null', () => {
		expect(isCapitalVillage(null)).toBe(false)
	})

	it('returns false for non-village items', () => {
		expect(
			isCapitalVillage({
				type: 'resource',
				value: 'apple'
			})
		).toBe(false)
	})

	it('returns false for un-owned villages', () => {
		expect(isCapitalVillage(villageItem({ tribe: null, level: 1 }))).toBe(false)
	})

	it('returns false for low-level owned villages', () => {
		expect(
			isCapitalVillage(villageItem({ tribe: 'barbarians', level: 1 }))
		).toBe(false)
		expect(
			isCapitalVillage(villageItem({ tribe: 'barbarians', level: 4 }))
		).toBe(false)
	})

	it('returns true for owned villages at the capital threshold', () => {
		expect(
			isCapitalVillage(villageItem({ tribe: 'barbarians', level: 5 }))
		).toBe(true)
		expect(
			isCapitalVillage(villageItem({ tribe: 'barbarians', level: 13 }))
		).toBe(true)
	})
})
