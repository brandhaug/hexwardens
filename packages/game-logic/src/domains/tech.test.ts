import {
	getResearchChoices,
	getTechNode,
	getTechResearchCost,
	type Tech,
	type ResearchChoice
} from './tech'

describe('Tech research interface', () => {
	it('projects research choices without Victory Points', () => {
		const choices = getResearchChoices({
			researchedTechs: ['clam_harvesting'],
			researchInProgress: null,
			tribe: 'barbarians',
			playerMoney: 7,
			ownedVillages: 2
		})

		const waterMilitary = choices.find(
			(choice) => choice.tech === 'water_and_bomber'
		)

		expect(waterMilitary).toEqual({
			tech: 'water_and_bomber',
			displayName: 'Water And Bomber',
			status: 'available',
			cost: 8,
			turnsToResearch: 0,
			parents: ['clam_harvesting'],
			passiveDescription:
				'Units gain the first water-movement branch; unlocks Bombardier training',
			isAligned: false,
			turnsRemaining: null,
			canAfford: false
		} satisfies ResearchChoice)
		expect(waterMilitary).not.toHaveProperty('victoryPoints')
	})

	it('uses per-Village expansion cost through the public cost query', () => {
		expect(getTechResearchCost('guild', 1)).toBe(7)
		expect(getTechResearchCost('guild', 4)).toBe(13)
	})

	it('returns immutable node metadata for layout callers', () => {
		const node = getTechNode('water_mastery')

		expect(node.parents).toEqual(['fish_farm', 'ocean_and_admiral'])
		expect(node.turnsToResearch).toBe(1)
		expect(node.tier).toBe(4)
		expect(node).not.toHaveProperty('victoryPoints')
	})
})

// Recovered TechPrice configuration, city counts 1 through 45.
const cityPrices: readonly (readonly number[])[] = [
	[5, 6, 7, 8],
	[6, 8, 9, 11],
	[7, 9, 11, 14],
	[8, 11, 13, 17],
	[9, 12, 15, 20],
	[10, 15, 19, 25],
	[11, 16, 21, 28],
	[12, 18, 23, 31],
	[13, 19, 25, 34],
	[14, 21, 27, 37],
	[15, 23, 31, 42],
	[16, 25, 33, 45],
	[17, 26, 35, 48],
	[18, 28, 37, 51],
	[19, 29, 39, 54],
	[20, 32, 43, 59],
	[21, 33, 45, 62],
	[22, 35, 47, 65],
	[23, 36, 49, 68],
	[24, 38, 51, 71],
	[25, 40, 55, 76],
	[26, 42, 57, 79],
	[27, 43, 59, 82],
	[28, 45, 61, 85],
	[29, 46, 63, 88],
	[30, 49, 67, 93],
	[31, 50, 69, 96],
	[32, 52, 71, 99],
	[33, 53, 73, 102],
	[34, 55, 75, 105],
	[35, 57, 79, 110],
	[36, 59, 81, 113],
	[37, 60, 83, 116],
	[38, 62, 85, 119],
	[39, 63, 87, 122],
	[40, 66, 91, 127],
	[41, 67, 93, 130],
	[42, 69, 95, 133],
	[43, 70, 97, 136],
	[44, 72, 99, 139],
	[45, 74, 103, 144],
	[46, 76, 105, 147],
	[47, 77, 107, 150],
	[48, 79, 109, 153],
	[49, 80, 111, 156]
]

it('uses every configured city price through the shared research query', () => {
	const tiers = [
		'climbing',
		'road_and_seaports',
		'guild',
		'mobility_mastery'
	] satisfies Tech[]
	for (const [index, prices] of cityPrices.entries()) {
		expect(tiers.map((tech) => getTechResearchCost(tech, index + 1))).toEqual(
			prices
		)
	}
})

it('retains legacy costs outside the recovered range', () => {
	expect(getTechResearchCost('guild', 0)).toBe(7)
	expect(getTechResearchCost('guild', 46)).toBe(52)
})
