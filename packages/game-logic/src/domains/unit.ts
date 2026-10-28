import { type TileGrid } from '../tile/tile'
import { capitalize } from 'lodash-es'
import { type BoardPosition } from '../board/position'
import { isWaterTerrain, type TileTerrain } from '../tile/tile-terrain'
import { type Tech } from './tech'
import { includesValue } from '../type-utils'
import { type Tribe, tribeToTribeStats } from './tribe'

export const unitTypes = [
	'caveman',
	'archer',
	'guard',
	'spearman',
	'seer',
	'sprinter',
	'mage',
	'swordsman',
	'bombardier',
	'tidebreaker',
	'berserker',
	'shogun',
	'wolf',
	'orc_raider',
	'black_knight',
	'clanker',
	'paladin',
	'skeleton_golem',
	'frostlord'
] as const
export type UnitType = (typeof unitTypes)[number]

export const heroUnitTypes = [
	'berserker',
	'shogun',
	'wolf',
	'orc_raider',
	'black_knight',
	'clanker',
	'paladin',
	'skeleton_golem',
	'frostlord'
] as const
export type HeroUnitType = (typeof heroUnitTypes)[number]

export type HeroAbilityType =
	| 'rage'
	| 'bushido'
	| 'ambush'
	| 'bloodlust'
	| 'hex_curse'
	| 'fortify'
	| 'piercing_shot'
	| 'mirage'
	| 'frozen_ground'

export type HeroAbility = {
	type: HeroAbilityType
	name: string
	description: string
}

export const heroUnitToAbility: Record<HeroUnitType, HeroAbility> = {
	berserker: {
		type: 'rage',
		name: 'Rage',
		description: 'Gains +2 ATK per kill this turn (resets at turn end)'
	},
	shogun: {
		type: 'bushido',
		name: 'Bushido',
		description: 'Adjacent friendly units get +3 ATK'
	},
	wolf: {
		type: 'ambush',
		name: 'Ambush',
		description: 'Deals 1.5x damage from jungle/forest tiles'
	},
	orc_raider: {
		type: 'bloodlust',
		name: 'Bloodlust',
		description: 'Heals 5 HP on kill'
	},
	black_knight: {
		type: 'hex_curse',
		name: 'Hex Curse',
		description: "Attacks reduce target's ATK by 3 for 2 turns"
	},
	clanker: {
		type: 'fortify',
		name: 'Fortify',
		description: 'Adjacent friendly units get +5 DEF'
	},
	paladin: {
		type: 'piercing_shot',
		name: 'Piercing Shot',
		description:
			"Attacks ignore target's DEF and pierce through lined-up enemies"
	},
	skeleton_golem: {
		type: 'mirage',
		name: 'Mirage',
		description: 'First attack each turn is dodged automatically'
	},
	frostlord: {
		type: 'frozen_ground',
		name: 'Frozen Ground',
		description: 'Enemies within 1 tile have movement reduced by 1'
	}
}

/**
 * Check if a unit type is a hero unit
 */
export function isHeroUnitType(unitType: UnitType): unitType is HeroUnitType {
	return includesValue(heroUnitTypes, unitType)
}

/**
 * Get effective max health for a unit. Heroes have static stats per ADR-0001
 * (no kill-leveling); only veterancy adjusts max HP.
 */
export function getEffectiveMaxHealth(
	unitType: UnitType,
	unitState: Pick<UnitState, 'veterancyBonusHp'>
): number {
	return unitToUnitStats[unitType].health + unitState.veterancyBonusHp
}

/**
 * Check if a tribe's hero unit is currently alive on the board
 */
export function isHeroAliveForTribe(board: TileGrid, tribe: Tribe): boolean {
	const tribeStats = tribeToTribeStats[tribe]
	const heroType = tribeStats.heroUnit

	for (const row of board) {
		for (const tile of row) {
			if (tile?.unit?.type === heroType && tile.unit.tribe === tribe) {
				return true
			}
		}
	}
	return false
}

/**
 * Get display name for a unit type (converts underscores to spaces and capitalizes)
 */
export function getUnitDisplayName(unitType: UnitType): string {
	return unitType
		.split('_')
		.map((word) => capitalize(word))
		.join(' ')
}

/** General (non-hero) unit types available via tech research */
export const generalUnitTypes = [
	'caveman',
	'archer',
	'guard',
	'spearman',
	'seer',
	'sprinter',
	'mage',
	'swordsman',
	'bombardier',
	'tidebreaker'
] as const

/** Cavalry unit types — targeted by Spearman "Brace" passive */
export const cavalryUnitTypes = ['seer', 'sprinter', 'tidebreaker'] as const

export type SpecialAttackAttribute =
	| 'move'
	| 'attack'
	| 'heal'
	| 'aoe around'
	| 'aoe through'
	| 'push'
	| 'collect'

export type UnitPassive =
	| 'brace'
	| 'cleave'
	| 'splash'
	| 'tide_command'
	| 'knockback'
	| 'flying'
	| null

export const unitPassiveToDescription: Record<
	NonNullable<UnitPassive>,
	{ name: string; description: string }
> = {
	brace: {
		name: 'Brace',
		description: '1.5x damage when counter-attacking cavalry'
	},
	cleave: {
		name: 'Cleave',
		description: '+2 ATK against melee defenders'
	},
	splash: {
		name: 'Splash',
		description: 'Deals reduced damage to enemies adjacent to the target'
	},
	tide_command: {
		name: 'Tide Command',
		description: 'Strong on water and can attack after moving there'
	},
	knockback: {
		name: 'Knockback',
		description:
			'Pushes a surviving target one tile back; blocked targets take +5 damage, water/ocean drowns non-naval units, and pushed targets cannot counter-attack'
	},
	flying: {
		name: 'Flying',
		description:
			'Moves over any terrain at 1 cost per tile (+1 sight); stopping on mountains, shallow water, or deep ocean still requires the matching tech'
	}
}

export type UnitStats = {
	health: number
	attack: number
	canAttackAfterMove: boolean
	canCaptureAfterMove: boolean
	defense: number
	movement: number
	waterMovement: number
	range: number
	waterRange: number
	cost: number
	air: boolean
	explorationRange: number
	specialAttackAttribute: SpecialAttackAttribute | null
	requiredTech: Tech | null
	passive: UnitPassive
}

export const unitToUnitStats: Record<UnitType, UnitStats> = {
	// --- Base units (no tech required) ---
	caveman: {
		health: 20,
		attack: 10,
		defense: 8,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 2,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	archer: {
		health: 20,
		attack: 10,
		defense: 8,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 2,
		cost: 4,
		air: true,
		waterMovement: 2,
		waterRange: 2,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: 'archer',
		passive: null
	},

	// --- Tier 1 tech units ---
	guard: {
		health: 30,
		attack: 6,
		defense: 18,
		canAttackAfterMove: false,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 4,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: 'guard',
		passive: null
	},
	spearman: {
		health: 25,
		attack: 12,
		defense: 8,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 4,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: 'aoe through',
		requiredTech: 'spearman',
		passive: 'brace'
	},

	// --- Tier 2 tech units ---
	seer: {
		health: 20,
		attack: 12,
		defense: 6,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 2,
		range: 1,
		cost: 4,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 2,
		specialAttackAttribute: null,
		requiredTech: 'seer',
		passive: null
	},

	// --- Tier 3 tech units ---
	sprinter: {
		health: 30,
		attack: 18,
		defense: 6,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 3,
		range: 1,
		cost: 8,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: 'sprinter',
		passive: null
	},
	mage: {
		health: 20,
		attack: 18,
		defense: 4,
		canAttackAfterMove: false,
		canCaptureAfterMove: false,
		movement: 1,
		range: 3,
		cost: 8,
		air: true,
		waterMovement: 2,
		waterRange: 3,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: 'mage',
		passive: 'splash'
	},
	swordsman: {
		health: 30,
		attack: 18,
		defense: 12,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 2,
		range: 1,
		cost: 8,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: 'swordsman',
		passive: 'cleave'
	},
	bombardier: {
		health: 20,
		attack: 8,
		defense: 8,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 2,
		cost: 8,
		air: true,
		waterMovement: 2,
		waterRange: 2,
		explorationRange: 1,
		specialAttackAttribute: 'aoe around',
		requiredTech: 'water_and_bomber',
		passive: 'splash'
	},
	tidebreaker: {
		health: 25,
		attack: 10,
		defense: 8,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 12,
		air: false,
		waterMovement: 3,
		waterRange: 2,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: 'ocean_and_admiral',
		passive: 'tide_command'
	},

	// --- Hero units (tribe-specific, no tech requirement) ---
	berserker: {
		health: 40,
		attack: 18,
		defense: 0,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 7,
		air: false,
		waterMovement: 1,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	shogun: {
		health: 40,
		attack: 15,
		defense: 3,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 7,
		air: false,
		waterMovement: 1,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	wolf: {
		health: 35,
		attack: 16,
		defense: 0,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 2,
		range: 1,
		cost: 7,
		air: false,
		waterMovement: 1,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	orc_raider: {
		health: 45,
		attack: 15,
		defense: 2,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 8,
		air: false,
		waterMovement: 1,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	black_knight: {
		health: 35,
		attack: 14,
		defense: 0,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 7,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	clanker: {
		health: 40,
		attack: 13,
		defense: 5,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 8,
		air: false,
		waterMovement: 1,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	paladin: {
		health: 35,
		attack: 16,
		defense: 0,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 7,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 2,
		specialAttackAttribute: 'aoe through',
		requiredTech: null,
		passive: null
	},
	skeleton_golem: {
		health: 35,
		attack: 14,
		defense: 0,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 2,
		range: 1,
		cost: 7,
		air: false,
		waterMovement: 2,
		waterRange: 1,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	},
	frostlord: {
		health: 45,
		attack: 15,
		defense: 3,
		canAttackAfterMove: true,
		canCaptureAfterMove: false,
		movement: 1,
		range: 1,
		cost: 8,
		air: false,
		waterMovement: 2,
		waterRange: 2,
		explorationRange: 1,
		specialAttackAttribute: null,
		requiredTech: null,
		passive: null
	}
}

const waterFormStats: UnitStats = {
	health: 0,
	attack: 8,
	defense: 6,
	canAttackAfterMove: true,
	canCaptureAfterMove: false,
	movement: 1,
	range: 2,
	cost: 0,
	air: true,
	waterMovement: 2,
	waterRange: 2,
	explorationRange: 1,
	specialAttackAttribute: null,
	requiredTech: null,
	passive: null
}

const bombshipStats: UnitStats = {
	...waterFormStats,
	attack: 14,
	defense: 14,
	passive: 'splash'
}

const battleshipStats: UnitStats = {
	...waterFormStats,
	attack: 16,
	defense: 10,
	waterMovement: 3,
	explorationRange: 2,
	passive: 'tide_command'
}

export function getEffectiveUnitStatsForTerrain(
	unitType: UnitType,
	terrain: TileTerrain
): UnitStats {
	const base = unitToUnitStats[unitType]
	if (!isWaterTerrain(terrain)) {
		return base
	}
	if (unitType === 'bombardier') {
		return { ...base, ...bombshipStats, health: base.health, cost: base.cost }
	}
	if (unitType === 'tidebreaker') {
		return { ...base, ...battleshipStats, health: base.health, cost: base.cost }
	}
	return { ...base, ...waterFormStats, health: base.health, cost: base.cost }
}

export type UnitMode = 'ready' | 'moved' | 'retreat' | 'acted'

export type UnitId = `unit_${string}`

export type Unit = {
	id: UnitId
	type: UnitType
	stats: UnitStats
	tribe: Tribe
}

export type UnitDebuff =
	| { type: 'hex_curse'; atkReduction: number; turnsRemaining: number }
	| { type: 'morale_loss'; atkReduction: number; turnsRemaining: number }

export type UnitState = {
	/** Recruitment city; absent for legacy saves and capacity-free summons. */
	homeVillage?: BoardPosition | null

	mode: UnitMode
	health: number
	level: number
	kills: number
	killsThisTurn: number
	position: BoardPosition
	debuffs: UnitDebuff[]
	veterancyBonusAtk: number
	veterancyBonusHp: number
	hasBeenAttackedThisTurn: boolean
}
