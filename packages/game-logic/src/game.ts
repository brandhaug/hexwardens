import { type BoardPosition, type HexCoordinate } from './board/position'
import { type ResourceValue } from './domains/resource'
import { type Tech } from './domains/tech'
import { type Tribe } from './domains/tribe'
import { type UnitType } from './domains/unit'
import { type VillageLevel, type VillagePerk } from './domains/village'
import { type PlayerStateRecord } from './player/player-state'
import { type TileGrid } from './tile/tile'
import { type TileItem } from './tile/tile-item'

export type { TileGrid } from './tile/tile'
import { typedKeys } from './type-utils'
import { type UnitStateRecord } from './unit-state-utils'

/**
 * Pairs the board and unitStates. All unit lifecycle mutations go through
 * {@link ./units/registry} helpers so the two never drift.
 */
export type UnitRegistry = {
	readonly board: TileGrid
	readonly unitStates: UnitStateRecord
}

/**
 * One outstanding Village level-up awaiting its owner's Perk choice. Pushed
 * by `applyVillageExperience` when a level-up crosses a threshold; drained
 * by the `selectPerk` intent (see `actions/features/select-perk/`).
 *
 * Order is FIFO — players resolve level-ups in the order they were earned.
 */
export type PendingPerkChoice = {
	villagePosition: BoardPosition
	level: VillageLevel
	options: VillagePerk[]
}

export type GameState = {
	units: UnitRegistry
	turn: number
	playerStates: PlayerStateRecord
	currentPlayerTribe: Tribe
	eliminatedTribes: Tribe[]
	isGameOver: boolean
	winner: Tribe | null
	nextUnitId: number
	seed: number
	/**
	 * Per-turn announcement counter — number of Village level-ups a Tribe
	 * earned during the just-finished turn. Drained by the Turn Executor's
	 * `villageExperienceCommit` phase, which emits a single `villageLevel`
	 * event with the count.
	 */
	pendingVillageLevelUps: Partial<Record<Tribe, number>>
	/**
	 * Durable Perk-pick queue — one entry per Village level-up that hasn't
	 * had its Perk chosen yet. Populated alongside `pendingVillageLevelUps`
	 * but **not** drained on turn rotation; only the `selectPerk` Action
	 * (and `eliminate-on-no-villages`) clears entries.
	 */
	pendingPerkChoices: Partial<Record<Tribe, PendingPerkChoice[]>>
}

type GameActionMove = {
	type: 'move'
	from: HexCoordinate
	to: HexCoordinate
}

type GameActionTrain = {
	type: 'train'
	hex: HexCoordinate
	unitType: UnitType
}

type GameActionBuild = {
	type: 'build'
	hex: HexCoordinate
	tileItem: TileItem
}

type GameActionUpgradeToLarge = {
	type: 'upgrade-to-large'
	hex: HexCoordinate
}

type GameActionExplore = {
	type: 'explore'
	hex: HexCoordinate
}

type GameActionAttack = {
	type: 'attack'
	from: HexCoordinate
	to: HexCoordinate
}

type GameActionCollect = {
	type: 'collect'
	hex: HexCoordinate
	value: ResourceValue
}

type GameActionResearch = {
	type: 'research'
	tech: Tech
}

type GameActionEndTurn = {
	type: 'endTurn'
}

export type GameAction =
	| GameActionMove
	| GameActionTrain
	| GameActionBuild
	| GameActionUpgradeToLarge
	| GameActionExplore
	| GameActionAttack
	| GameActionCollect
	| GameActionResearch
	| GameActionEndTurn

type VillageExperienceEvent =
	| 'resource_collected'
	| 'building_built'
	| 'building_upgraded'

export const gameEventToVillageExperience: Record<
	VillageExperienceEvent,
	number
> = {
	resource_collected: 1,
	building_built: 2,
	building_upgraded: 2
}

export const gameEventToCost: Record<VillageExperienceEvent, number> = {
	resource_collected: 2,
	building_built: 5,
	building_upgraded: 5
}

/**
 * Count the number of alive tribes in the game
 */
export function getAliveTribesCount(gameState: GameState): number {
	return getAliveTribes(gameState).length
}

/**
 * Get all alive tribes in the game. Pass `tribesWithVillages` when the caller
 * has already scanned the board (e.g. `sealOutcome`) to skip a second walk.
 */
export function getAliveTribes(
	gameState: GameState,
	tribesWithVillages: Set<Tribe> = getTribesWithVillages(gameState)
): Tribe[] {
	return calculateTribeSurvival(
		typedKeys(gameState.playerStates),
		gameState.eliminatedTribes,
		tribesWithVillages
	).aliveTribes
}

export function getVillageEliminatedTribes(
	gameState: GameState,
	tribesWithVillages: Set<Tribe> = getTribesWithVillages(gameState)
): Tribe[] {
	if (tribesWithVillages.size === 0) {
		return gameState.eliminatedTribes
	}

	return calculateTribeSurvival(
		typedKeys(gameState.playerStates),
		gameState.eliminatedTribes,
		tribesWithVillages
	).eliminatedTribes
}

/** Preserves prior eliminations, then appends village losses in player order. */
export function calculateTribeSurvival(
	playerTribes: readonly Tribe[],
	eliminatedTribes: readonly Tribe[],
	tribesWithVillages: ReadonlySet<Tribe>
) {
	const eliminated = new Set(eliminatedTribes)
	// Village-free fixtures use explicit eliminations only.
	if (tribesWithVillages.size > 0) {
		for (const tribe of playerTribes) {
			if (!tribesWithVillages.has(tribe)) {
				eliminated.add(tribe)
			}
		}
	}
	return {
		aliveTribes: playerTribes.filter((tribe) => !eliminated.has(tribe)),
		eliminatedTribes: [...eliminated]
	}
}

export function getTribesWithVillages(gameState: GameState): Set<Tribe> {
	const tribesWithVillages = new Set<Tribe>()
	for (const row of gameState.units.board) {
		for (const tile of row) {
			const item = tile?.item
			if (item?.type === 'village' && item.tribe) {
				tribesWithVillages.add(item.tribe)
			}
		}
	}
	return tribesWithVillages
}

/**
 * Generate the next unit ID and return both the ID and updated counter
 */
export function generateNextUnitId(nextUnitId: number): UnitAllocation {
	return {
		unitId: `unit_${nextUnitId}`,
		nextUnitId: nextUnitId + 1
	}
}

type UnitAllocation = {
	unitId: `unit_${string}`
	nextUnitId: number
}
