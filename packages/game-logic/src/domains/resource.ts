import { type TileTerrain } from '../tile/tile-terrain.ts'

export const resources = [
	'apple',
	'iron',
	'mushroom',
	'pearl',
	'gem',
	'wheat',
	'berry',
	'granite',
	'herb',
	'leather',
	'clay',
	'fish',
	'crystal'
] as const

export type ResourceValue = (typeof resources)[number]

export type Resource = {
	type: 'resource'
	value: ResourceValue
}

export const resourceToTerrain: Record<ResourceValue, TileTerrain> = {
	wheat: 'grass',
	leather: 'snow',
	pearl: 'water',
	berry: 'forest',
	gem: 'stone',
	granite: 'desert',
	herb: 'jungle',
	mushroom: 'swamp',
	fish: 'tundra',
	clay: 'terraced',
	iron: 'barren',
	apple: 'grass',
	crystal: 'ice'
}
