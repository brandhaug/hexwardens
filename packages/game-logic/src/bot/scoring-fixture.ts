import { type ReadonlyData } from '../type-utils'
import { type Hex } from 'honeycomb-grid'
import { Board } from '../board/board'
import {
	type BoardPosition,
	type PositionKey,
	positionKey
} from '../board/position'

import { getTribeVillageRange } from '../board/tribe-range'
import { type Tribe } from '../domains/tribe'
import { type Tech } from '../domains/tech'
import { type Unit, type UnitState } from '../domains/unit'
import { type GameState } from '../game'
import { createGameWorld } from '../engine/world'
import { type PlayerRead } from '../player/player-state'

import { type TileState } from '../tile/tile'

export type ScoringUnit = ReadonlyData<{
	readonly unit: Unit
	readonly state: UnitState
	readonly position: BoardPosition
	readonly tile: TileState
}>

export type TileFilter = (
	position: BoardPosition,
	tile: ReadonlyData<TileState>
) => boolean

/**
 * Per-turn scoring context built once and shared by every scorer. Owns the
 * Board instance and indexes friendly/enemy units so scorers stop reconstructing
 * these from the raw `gameState` on every call.
 */
export interface ScoringFixture {
	readonly gameState: GameState
	readonly tribe: Tribe
	readonly board: Board
	readonly gameHex: typeof Hex
	readonly radius: number
	readonly positionalAwareness: boolean
	readonly lookahead: boolean
	readonly playerState: PlayerRead | undefined
	readonly researchedTechs: readonly Tech[]
	readonly friendlyUnits: readonly ScoringUnit[]
	readonly enemyUnits: readonly ScoringUnit[]
	readonly friendlyVillages: readonly BoardPosition[]
	readonly enemyVillages: readonly BoardPosition[]
	/**
	 * Tribe territory (Village range) for `tribe`, derived once per fixture
	 * via the single owner, `board/tribe-range.ts::getTribeVillageRange`.
	 */
	readonly villageRange: ReadonlySet<PositionKey>
	candidateTiles(
		filter: TileFilter
	): Array<[BoardPosition, ReadonlyData<TileState>]>
	enemiesWithin(position: BoardPosition, range: number): readonly ScoringUnit[]
	/**
	 * Hex distance from `position` to the nearest enemy Village. Returns
	 * `Infinity` when the Tribe has no enemy Villages. Memoized by
	 * `positionKey` so identical lookups across scorers cost O(1) after the
	 * first call — earns its keep in `scoreMoveActions`, where the same
	 * unit-position distance was previously recomputed once per candidate
	 * target tile.
	 */
	distanceToNearestEnemyVillage(position: BoardPosition): number
	/** Hex distance from `position` to the nearest friendly Village. */
	distanceToNearestFriendlyVillage(position: BoardPosition): number
}

export interface FixtureInput {
	gameState: GameState
	tribe: Tribe
	gameHex: typeof Hex
	radius: number
	positionalAwareness: boolean
	lookahead: boolean
}

export function buildScoringFixture(input: FixtureInput): ScoringFixture {
	const { gameState, tribe } = input
	const world = createGameWorld(gameState)
	const board = Board.from(gameState.units.board)
	const tiles = world
		.tiles()
		.toSorted((a, b) => a.at.r_idx - b.at.r_idx || a.at.q_idx - b.at.q_idx)

	const friendlyUnits: ScoringUnit[] = []
	const enemyUnits: ScoringUnit[] = []
	const friendlyVillages: BoardPosition[] = []
	const enemyVillages: BoardPosition[] = []

	for (const { at: position, tile } of tiles) {
		if (tile.unit) {
			const state = world.unit(tile.unit.id)?.state
			if (state) {
				const entry: ScoringUnit = { unit: tile.unit, state, position, tile }
				if (tile.unit.tribe === tribe) {
					friendlyUnits.push(entry)
				} else {
					enemyUnits.push(entry)
				}
			}
		}
		if (tile.item?.type === 'village') {
			if (tile.item.tribe === tribe) {
				friendlyVillages.push(position)
			} else if (tile.item.tribe !== null) {
				enemyVillages.push(position)
			}
		}
	}

	const playerState = world.player(tribe)
	const researchedTechs = playerState?.researchedTechs ?? []
	const villageRange = getTribeVillageRange(gameState.units.board, tribe)

	const enemyVillageDistanceCache = new Map<PositionKey, number>()
	const friendlyVillageDistanceCache = new Map<PositionKey, number>()

	function minDistance(
		position: BoardPosition,
		targets: readonly BoardPosition[]
	): number {
		let min = Infinity
		for (const target of targets) {
			const d = board.distance(position, target)
			if (d < min) {
				min = d
			}
		}
		return min
	}

	return {
		gameState,
		tribe,
		board,
		gameHex: input.gameHex,
		radius: input.radius,
		positionalAwareness: input.positionalAwareness,
		lookahead: input.lookahead,
		playerState,
		researchedTechs,
		friendlyUnits,
		enemyUnits,
		friendlyVillages,
		enemyVillages,
		villageRange,
		candidateTiles(filter) {
			const out: Array<[BoardPosition, ReadonlyData<TileState>]> = []
			for (const { at: pos, tile } of tiles) {
				if (filter(pos, tile)) {
					out.push([pos, tile])
				}
			}
			return out
		},
		enemiesWithin(position, range) {
			const within: ScoringUnit[] = []
			for (const enemy of enemyUnits) {
				if (board.distance(position, enemy.position) <= range) {
					within.push(enemy)
				}
			}
			return within
		},
		distanceToNearestEnemyVillage(position) {
			if (enemyVillages.length === 0) {
				return Infinity
			}
			const key = positionKey(position)
			const cached = enemyVillageDistanceCache.get(key)
			if (cached !== undefined) {
				return cached
			}
			const value = minDistance(position, enemyVillages)
			enemyVillageDistanceCache.set(key, value)
			return value
		},
		distanceToNearestFriendlyVillage(position) {
			if (friendlyVillages.length === 0) {
				return Infinity
			}
			const key = positionKey(position)
			const cached = friendlyVillageDistanceCache.get(key)
			if (cached !== undefined) {
				return cached
			}
			const value = minDistance(position, friendlyVillages)
			friendlyVillageDistanceCache.set(key, value)
			return value
		}
	}
}
