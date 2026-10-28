import { addVillageExperience } from './village-progression'
import {
	CAPITAL_MAX_POPULATION_BONUS,
	createVillage,
	villageMaxPopulation
} from './village'

describe('createVillage', () => {
	it('defaults the village kind to regular', () => {
		const village = createVillage(0)
		expect(village.kind).toBe('regular')
	})

	it('uses the level-base maxPopulation for a regular village', () => {
		const village = createVillage(0)
		expect(village.maxPopulation).toBe(2)
	})

	it('grants a capital +1 maxPopulation over the level base', () => {
		const regular = createVillage(0, 'regular')
		const capital = createVillage(0, 'capital')
		expect(capital.maxPopulation).toBe(
			regular.maxPopulation + CAPITAL_MAX_POPULATION_BONUS
		)
		expect(capital.kind).toBe('capital')
	})
})

describe('villageMaxPopulation', () => {
	it('returns the level base for regular villages at every level', () => {
		expect(villageMaxPopulation(1, 'regular')).toBe(2)
		expect(villageMaxPopulation(13, 'regular')).toBe(15)
	})

	it('adds the capital bonus at every level', () => {
		expect(villageMaxPopulation(1, 'capital')).toBe(3)
		expect(villageMaxPopulation(13, 'capital')).toBe(16)
	})
})

it('starts capitals with two income and preserves their income bonus on growth', () => {
	const capital = createVillage(0, 'capital')
	expect(capital.salary).toBe(2)
	expect(createVillage(0).salary).toBe(1)
	expect(
		addVillageExperience({ ...capital, salary: capital.salary + 1 }, 5).village
			.salary
	).toBe(5)
})
