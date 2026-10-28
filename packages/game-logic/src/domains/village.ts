import { Board, type BoardPosition } from '../board/board'
import { assertNever } from '../type-utils'
import { type GameState } from '../game'
import { type Tribe } from './tribe'

import {
	type VillageLevel,
	type VillagePerk,
	type VillageKind
} from './village-values'
export {
	villageLevels,
	villagePerks,
	villageKinds,
	type VillageLevel,
	type VillagePerk,
	type VillageKind
} from './village-values'

const villageExperienceToNextLevel: Record<VillageLevel, number> = {
	1: 2,
	2: 3,
	3: 4,
	4: 5,
	5: 6,
	6: 7,
	7: 8,
	8: 9,
	9: 10,
	10: 11,
	11: 12,
	12: 13,
	13: 14
}

export const villagePerkToDescription: Record<
	VillagePerk,
	{ name: string; description: string }
> = {
	instant_gold: { name: 'Treasury', description: '+5 gold immediately.' },
	expand_sight: {
		name: 'Explorers',
		description: 'Reveal a small region of the map around the Village.'
	},
	increase_population: {
		name: 'Housing',
		description: '+2 unit capacity in this Village.'
	},
	extra_money: {
		name: 'Workshop',
		description: '+1 salary from this Village every turn.'
	},
	expand_range: {
		name: 'Border Growth',
		description: '+1 working range on this Village.'
	},
	special_unit: {
		name: 'Hero',
		description:
			'Summon your Tribe Hero on this Village (acted this turn). Only offered at level 5 — passing it up forfeits this Hero forever.'
	},
	extra_experience: {
		name: 'Festival',
		description: '+3 experience immediately. Can trigger another level-up.'
	}
}

/**
 * Perk options offered at each Village level-up. Per ADR-0001, `special_unit`
 * appears only at the level-5 transition; choosing any other perk at level 5
 * forfeits that Village's Hero forever, even after capture.
 */
export function getPerkOptionsForLevel(level: VillageLevel): VillagePerk[] {
	switch (level) {
		case 2: {
			return ['expand_sight', 'instant_gold']
		}
		case 3: {
			return ['increase_population', 'expand_range']
		}
		case 4: {
			return ['extra_experience', 'extra_money']
		}
		case 5: {
			return ['special_unit', 'extra_money', 'increase_population']
		}
		case 1:
		case 6:
		case 7:
		case 8:
		case 9:
		case 10:
		case 11:
		case 12:
		case 13: {
			return ['extra_money', 'extra_experience', 'increase_population']
		}
	}
	return assertNever(level)
}

const villageLevelToBaseMaxPopulation: Record<VillageLevel, number> = {
	1: 2,
	2: 4,
	3: 5,
	4: 6,
	5: 7,
	6: 8,
	7: 9,
	8: 10,
	9: 11,
	10: 12,
	11: 13,
	12: 14,
	13: 15
}

const villageLevelToSalary: Record<VillageLevel, number> = {
	1: 1,
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 10,
	11: 11,
	12: 12,
	13: 13
}

export const villageLevelConstants = {
	experienceToNextLevel: villageExperienceToNextLevel,
	salary: villageLevelToSalary,
	maxPopulation: villageLevelToBaseMaxPopulation
} as const

/**
 * Pending capture marker placed on a Village when a capable Unit issues the
 * `capture` Action. Ownership only flips when rotation lands on `byTribe`
 * (the start of that tribe's next Turn) and the capturing unit is still on
 * the village tile. See `turns/index.ts` `applyCaptureFlip`.
 *
 * Cleared by: unit death, unit movement off the tile, or another capturer
 * overwriting the marker (most-recent capturer wins).
 *
 * `turnInitiated` is informational — UI affordances ("capturing… 1 turn
 * left") read it; flip resolution does not.
 */
export type CaptureSetup = {
	byTribe: Tribe
	turnInitiated: number
}

export const CAPITAL_MAX_POPULATION_BONUS = 1

export type Village = {
	type: 'village'
	state: 'idle' | 'built'
	kind: VillageKind
	level: VillageLevel
	tribe: Tribe | null
	experience: number
	experienceToNextLevel: number
	perks: readonly VillagePerk[]
	population: number
	maxPopulation: number
	range: number
	salary: number
	captureSetup: CaptureSetup | null
}

/**
 * Returns the maximum population for a village of {@link level} and
 * {@link kind}. A `capital` village always gets {@link CAPITAL_MAX_POPULATION_BONUS}
 * over the level base so the bonus is preserved through level-ups and capture.
 */
export const villageMaxPopulation = (
	level: VillageLevel,
	kind: VillageKind
): number => {
	const base = villageLevelToBaseMaxPopulation[level]
	return kind === 'capital' ? base + CAPITAL_MAX_POPULATION_BONUS : base
}

export const createVillage = (
	population: number,
	kind: VillageKind = 'regular'
): Village => {
	const level = 1

	return {
		type: 'village',
		state: 'idle',
		kind,
		level,
		tribe: null,
		experience: 0,
		experienceToNextLevel: villageExperienceToNextLevel[level],
		perks: [],
		population,
		maxPopulation: villageMaxPopulation(level, kind),
		range: 1,
		salary: villageLevelToSalary[level] + (kind === 'capital' ? 1 : 0),
		captureSetup: null
	}
}

export function findControllingVillage(
	position: BoardPosition,
	gameState: GameState,
	tribe: Tribe
): { position: BoardPosition; village: Village } | null {
	const board = gameState.units.board
	for (const [r, row] of board.entries()) {
		for (const [q, tile] of row.entries()) {
			if (tile?.item?.type !== 'village') {
				continue
			}
			if (tile.item.tribe !== tribe) {
				continue
			}
			const distance = Board.from(board).distance(position, {
				q_idx: q,
				r_idx: r
			})
			if (distance > tile.item.range) {
				continue
			}
			return {
				position: { q_idx: q, r_idx: r },
				village: tile.item
			}
		}
	}
	return null
}

export function findVillagesByTribe(
	board: GameState['units']['board'],
	tribe: Tribe
): BoardPosition[] {
	const villages: BoardPosition[] = []

	board.forEach((row, r_idx) => {
		row.forEach((tile, q_idx) => {
			if (tile?.item?.type === 'village' && tile.item.tribe === tribe) {
				villages.push({ q_idx, r_idx })
			}
		})
	})

	return villages
}
