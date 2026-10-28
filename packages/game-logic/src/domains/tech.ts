import { type Tribe } from './tribe'
export const techs = [
	// Mobility path
	'climbing',
	'road_and_seaports',
	'guild',
	'mobility_mastery',

	// Water path
	'clam_harvesting',
	'coral_reef',
	'fish_farm',
	'water_and_bomber',
	'ocean_and_admiral',
	'water_mastery',

	// Plants path
	'fruit_harvesting',
	'farming',
	'windmill',
	'guard',
	'city_wall',
	'plant_mastery',

	// Earth path
	'meat_harvesting',
	'lumber_mill',
	'paper_mill',
	'archer',
	'mage',
	'earth_mastery',

	// Fire path
	'cheese',
	'camp',
	'pasture',
	'seer',
	'sprinter',
	'fire_mastery',

	// Mineral path
	'gem',
	'mine',
	'quarry',
	'spearman',
	'swordsman',
	'mineral_mastery'
] as const

export type Tech = (typeof techs)[number]

export function getTechDisplayName(tech: Tech): string {
	return tech
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

type TechNode = {
	parents: readonly Tech[]
	cost: number
	tier: number
	turnsToResearch: number
}

const instantNode = (
	cost: number,
	tier: number,
	parents: Tech[]
): TechNode => ({
	parents,
	cost,
	tier,
	turnsToResearch: 0
})

const masteryNode = (parents: Tech[]): TechNode => ({
	parents,
	cost: 8,
	tier: 4,
	turnsToResearch: 1
})

export const techTree: Record<Tech, TechNode> = {
	// Mobility path
	climbing: instantNode(5, 1, []),
	road_and_seaports: instantNode(6, 2, ['climbing']),
	guild: instantNode(7, 3, ['road_and_seaports']),
	mobility_mastery: masteryNode(['guild']),

	// Water path
	clam_harvesting: instantNode(5, 1, []),
	coral_reef: instantNode(6, 2, ['clam_harvesting']),
	fish_farm: instantNode(7, 3, ['coral_reef']),
	water_and_bomber: instantNode(6, 2, ['clam_harvesting']),
	ocean_and_admiral: instantNode(7, 3, ['water_and_bomber']),
	water_mastery: masteryNode(['fish_farm', 'ocean_and_admiral']),

	// Plants path
	fruit_harvesting: instantNode(5, 1, []),
	farming: instantNode(6, 2, ['fruit_harvesting']),
	windmill: instantNode(7, 3, ['farming']),
	guard: instantNode(6, 2, ['fruit_harvesting']),
	city_wall: instantNode(7, 3, ['guard']),
	plant_mastery: masteryNode(['windmill', 'city_wall']),

	// Earth path
	meat_harvesting: instantNode(5, 1, []),
	lumber_mill: instantNode(6, 2, ['meat_harvesting']),
	paper_mill: instantNode(7, 3, ['lumber_mill']),
	archer: instantNode(6, 2, ['meat_harvesting']),
	mage: instantNode(7, 3, ['archer']),
	earth_mastery: masteryNode(['paper_mill', 'mage']),

	// Fire path
	cheese: instantNode(5, 1, []),
	camp: instantNode(6, 2, ['cheese']),
	pasture: instantNode(7, 3, ['camp']),
	seer: instantNode(6, 2, ['cheese']),
	sprinter: instantNode(7, 3, ['seer']),
	fire_mastery: masteryNode(['pasture', 'sprinter']),

	// Mineral path
	gem: instantNode(5, 1, []),
	mine: instantNode(6, 2, ['gem']),
	quarry: instantNode(7, 3, ['mine']),
	spearman: instantNode(6, 2, ['gem']),
	swordsman: instantNode(7, 3, ['spearman']),
	mineral_mastery: masteryNode(['quarry', 'swordsman'])
}

/**
 * Tech passive bonuses. Some entries are currently documentation/unlock markers;
 * only the passives consumed by movement, combat, turns, collect, and heal
 * handlers affect runtime behavior.
 */
export type TechPassiveType =
	| 'mountain_traversal'
	| 'tracking'
	| 'territory_movement'
	| 'tactics_bonus'
	| 'ranged_bonus'
	| 'ranged_sight'
	| 'smithing_bonus'
	| 'engineering_bonus'
	| 'chivalry_bonus'
	| 'territory_regen'
	| 'philosophy_bonus'
	| 'mastery_bonus'
	| 'mobility_movement'
	| 'guard_mastery'
	| 'cavalry_mastery'
	| 'resource_unlock'
	| 'building_unlock'
	| 'unit_unlock'
	| 'water_traversal'
	| 'ocean_traversal'
	| 'upgrade_unlock'
	| 'retire_unlock'
	| 'city_defense'

type TechPassive = {
	type: TechPassiveType
	description: string
}

const techToPassive: Record<Tech, TechPassive> = {
	climbing: {
		type: 'mountain_traversal',
		description:
			'Units may cross mountain tiles; occupants gain +1 sight from the elevated vantage'
	},
	road_and_seaports: {
		type: 'territory_movement',
		description:
			'Friendly territory grants +1 movement from owned village range'
	},
	guild: {
		type: 'retire_unlock',
		description:
			'Unlocks the guild economy branch and future retire-style unit conversion'
	},
	mobility_mastery: {
		type: 'mobility_movement',
		description: 'Mastery: all units gain +1 movement'
	},
	clam_harvesting: {
		type: 'resource_unlock',
		description: 'Pearl resources can be collected for village development'
	},
	coral_reef: {
		type: 'building_unlock',
		description: 'Tavern primary buildings can be built on water tiles'
	},
	fish_farm: {
		type: 'building_unlock',
		description: 'Dock secondary buildings can be built next to Taverns'
	},
	water_and_bomber: {
		type: 'water_traversal',
		description:
			'Units gain the first water-movement branch; unlocks Bombardier training'
	},
	ocean_and_admiral: {
		type: 'ocean_traversal',
		description:
			'Units may cross deep ocean tiles; unlocks Tidebreaker training'
	},
	water_mastery: {
		type: 'upgrade_unlock',
		description: 'Mastery: water economy upgrades become stronger'
	},
	fruit_harvesting: {
		type: 'resource_unlock',
		description: 'Apple resources can be collected for village development'
	},
	farming: {
		type: 'building_unlock',
		description: 'Farm primary buildings can be built on plant-family terrain'
	},
	windmill: {
		type: 'upgrade_unlock',
		description: 'Windmill secondary buildings can be built next to Farms'
	},
	guard: {
		type: 'unit_unlock',
		description: 'Unlocks Guard training'
	},
	city_wall: {
		type: 'city_defense',
		description: 'Units defending owned villages gain +5 DEF'
	},
	plant_mastery: {
		type: 'guard_mastery',
		description: 'Mastery: Guards gain 150% defense'
	},
	meat_harvesting: {
		type: 'tracking',
		description: '+1 ATK for melee units'
	},
	lumber_mill: {
		type: 'building_unlock',
		description: 'Lumber Mill primary buildings can be built on forest terrain'
	},
	paper_mill: {
		type: 'upgrade_unlock',
		description:
			'Watermill secondary buildings can be built next to Lumber Mills'
	},
	archer: {
		type: 'ranged_bonus',
		description: 'Unlocks Archer training and grants +1 range to ranged units'
	},
	mage: {
		type: 'engineering_bonus',
		description: 'Unlocks Mage training and grants Mages +1 range'
	},
	earth_mastery: {
		type: 'ranged_sight',
		description: 'Mastery: ranged units become stronger scouts'
	},
	cheese: {
		type: 'resource_unlock',
		description: 'Granite resources can be collected for village development'
	},
	camp: {
		type: 'building_unlock',
		description: 'Camp primary buildings can be built on desert terrain'
	},
	pasture: {
		type: 'upgrade_unlock',
		description: 'Stables secondary buildings can be built next to Camps'
	},
	seer: {
		type: 'unit_unlock',
		description: 'Unlocks Seer training'
	},
	sprinter: {
		type: 'chivalry_bonus',
		description: 'Unlocks Sprinter training; Sprinters gain +1 movement'
	},
	fire_mastery: {
		type: 'cavalry_mastery',
		description: 'Mastery: Seers and Sprinters gain 150% defense'
	},
	gem: {
		type: 'resource_unlock',
		description: 'Gem resources can be collected for village development'
	},
	mine: {
		type: 'building_unlock',
		description: 'Mine primary buildings can be built on mineral-family terrain'
	},
	quarry: {
		type: 'building_unlock',
		description: 'Blacksmith secondary buildings can be built next to Mines'
	},
	spearman: {
		type: 'unit_unlock',
		description: 'Unlocks Spearman training'
	},
	swordsman: {
		type: 'smithing_bonus',
		description: 'Unlocks Swordsman training; +2 DEF for melee units'
	},
	mineral_mastery: {
		type: 'territory_regen',
		description: 'Mastery: units on friendly territory heal 2 HP/turn'
	}
}

/** Check if a player has a specific tech passive */
export function hasTechPassive(
	researchedTechs: readonly Tech[],
	passive: TechPassiveType
): boolean {
	return researchedTechs.some((tech) => techToPassive[tech].type === passive)
}

/** Tribe-aligned techs — researching these grants an extra bonus */
export const tribeToAlignedTechs: Record<Tribe, Tech[]> = {
	barbarians: ['climbing', 'swordsman'],
	rogues: ['seer', 'sprinter'],
	druids: ['fruit_harvesting', 'meat_harvesting'],
	orcs: ['mine'],
	wraiths: ['fruit_harvesting', 'farming'],
	engineers: ['gem', 'mine', 'quarry'],
	templars: ['archer', 'paper_mill', 'earth_mastery'],
	skeletons: ['fruit_harvesting', 'road_and_seaports', 'guild'],
	frostkin: ['climbing', 'mineral_mastery']
}

/**
 * Check if a tech can be researched given already-researched techs
 */
export function canResearchTech(
	tech: Tech,
	researchedTechs: readonly Tech[]
): boolean {
	const researched = new Set(researchedTechs)
	if (researched.has(tech)) {
		return false
	}
	const node = techTree[tech]
	return node.parents.every((parent) => researched.has(parent))
}

/**
 * Get all techs available for research given already-researched techs
 */
export function getAvailableTechs(researchedTechs: readonly Tech[]): Tech[] {
	return techs.filter((tech) => canResearchTech(tech, researchedTechs))
}

export type ResearchChoiceStatus =
	| 'researched'
	| 'in-progress'
	| 'available'
	| 'locked'

export type ResearchChoice = {
	tech: Tech
	displayName: string
	status: ResearchChoiceStatus
	cost: number
	turnsToResearch: number
	parents: readonly Tech[]
	passiveDescription: string
	isAligned: boolean
	turnsRemaining: number | null
	canAfford: boolean
}

export type ResearchChoiceArgs = {
	researchedTechs: readonly Tech[]
	researchInProgress: { tech: Tech; turnsRemaining: number } | null
	tribe?: Tribe
	playerMoney?: number
	ownedVillages: number
}

export function getTechNode(tech: Tech): TechNode {
	const node = techTree[tech]
	return { ...node, parents: [...node.parents] }
}

export function getTechResearchCost(tech: Tech, ownedVillages: number): number {
	const expansionCost = Math.max(0, ownedVillages - 1)
	const node = techTree[tech]
	// Matches all recovered TechPrice rows, for 1–45 cities. Outside that
	// range preserve the existing rule; the reference provides no further rows.
	if (
		!Number.isInteger(ownedVillages) ||
		ownedVillages < 1 ||
		ownedVillages > 45
	) {
		return node.cost + expansionCost
	}
	const fiveCitySteps = Math.floor(expansionCost / 5)
	switch (node.tier) {
		case 2: {
			return 6 + Math.ceil(1.5 * expansionCost) + fiveCitySteps
		}
		case 3: {
			return 7 + 2 * expansionCost + 2 * fiveCitySteps
		}
		case 4: {
			return 8 + 3 * expansionCost + 2 * fiveCitySteps
		}
		default: {
			return 5 + expansionCost
		}
	}
}

export function getResearchChoices(args: ResearchChoiceArgs): ResearchChoice[] {
	const researchedSet = new Set(args.researchedTechs)
	const alignedSet = new Set(args.tribe ? tribeToAlignedTechs[args.tribe] : [])

	return techs.map((tech) => {
		const node = techTree[tech]
		const cost = getTechResearchCost(tech, args.ownedVillages)
		return {
			tech,
			displayName: getTechDisplayName(tech),
			status: getResearchChoiceStatus(
				tech,
				args.researchedTechs,
				researchedSet,
				args.researchInProgress
			),
			cost,
			turnsToResearch: node.turnsToResearch,
			parents: [...node.parents],
			passiveDescription: techToPassive[tech].description,
			isAligned: alignedSet.has(tech),
			turnsRemaining:
				args.researchInProgress?.tech === tech
					? args.researchInProgress.turnsRemaining
					: null,
			canAfford: args.playerMoney === undefined || args.playerMoney >= cost
		}
	})
}

function getResearchChoiceStatus(
	tech: Tech,
	researchedTechs: readonly Tech[],
	researchedSet: ReadonlySet<Tech>,
	researchInProgress: { tech: Tech; turnsRemaining: number } | null
): ResearchChoiceStatus {
	if (researchedSet.has(tech)) {
		return 'researched'
	}
	if (researchInProgress?.tech === tech) {
		return 'in-progress'
	}
	if (!canResearchTech(tech, researchedTechs)) {
		return 'locked'
	}
	return 'available'
}

/**
 * Check if a player has researched a specific tech
 */
export function hasResearchedTech(
	researchedTechs: readonly Tech[],
	tech: Tech
): boolean {
	return researchedTechs.includes(tech)
}
