import { type TileTerrain } from '../tile/tile-terrain.ts'
import { includesValue } from '../type-utils'
import { type HeroUnitType, type UnitType } from './unit'

export const tribes = [
	'barbarians',
	'rogues',
	'druids',
	'orcs',
	'wraiths',
	'engineers',
	'templars',
	'skeletons',
	'frostkin'
] as const
export type Tribe = (typeof tribes)[number]

type TribeStats = {
	money: number
	primaryUnit: UnitType
	secondaryUnit: UnitType | null
	heroUnit: HeroUnitType
}

export const tribeToTribeStats: Record<Tribe, TribeStats> = {
	barbarians: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'caveman',
		heroUnit: 'berserker'
	},
	rogues: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'seer',
		heroUnit: 'shogun'
	},
	druids: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'spearman',
		heroUnit: 'wolf'
	},
	orcs: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'guard',
		heroUnit: 'orc_raider'
	},
	wraiths: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: null,
		heroUnit: 'black_knight'
	},
	engineers: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'guard',
		heroUnit: 'clanker'
	},
	templars: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'archer',
		heroUnit: 'paladin'
	},
	skeletons: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: null,
		heroUnit: 'skeleton_golem'
	},
	frostkin: {
		money: 5,
		primaryUnit: 'caveman',
		secondaryUnit: 'spearman',
		heroUnit: 'frostlord'
	}
}

export const tribeToTerrain: Record<Tribe, TileTerrain> = {
	barbarians: 'tundra',
	rogues: 'terraced',
	druids: 'jungle',
	orcs: 'barren',
	wraiths: 'swamp',
	engineers: 'stone',
	templars: 'forest',
	skeletons: 'desert',
	frostkin: 'ice'
}

export const tribeToColor: Record<Tribe, string> = {
	barbarians: 'bg-red-600',
	rogues: 'bg-blue-600',
	druids: 'bg-[#4d9f5b]',
	orcs: 'bg-red-900',
	wraiths: 'bg-purple-600',
	engineers: 'bg-yellow-600',
	templars: 'bg-emerald-600',
	skeletons: 'bg-stone-300',
	frostkin: 'bg-cyan-500'
}

// Foreground class that clears WCAG AA (≥4.5:1) against each tribe bg.
// Light/yellow tribe badges need dark text; the other tribe colors use white.
export const tribeToTextColor: Record<Tribe, string> = {
	barbarians: 'text-white',
	rogues: 'text-white',
	druids: 'text-white',
	orcs: 'text-white',
	wraiths: 'text-white',
	engineers: 'text-black',
	templars: 'text-white',
	skeletons: 'text-black',
	frostkin: 'text-white'
}
/**
 * Type guard to check if a value is a valid Tribe
 */

export function isTribe(value: string | null): value is Tribe {
	return value !== null && includesValue(tribes, value)
}
