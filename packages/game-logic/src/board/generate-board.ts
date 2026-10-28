import { Direction, Grid, line, spiral } from 'honeycomb-grid'
import Prando from 'prando'
import { GAME_CONFIG } from '../config'
import { isObstacleTerrain, terrainToObstacleKind } from '../domains/obstacle'
import {
	primaryBuildings,
	primaryBuildingToTerrains
} from '../domains/primary-building'
import { resources, resourceToTerrain } from '../domains/resource'
import { createRuins } from '../domains/ruins'
import { type Tribe, tribes, tribeToTerrain } from '../domains/tribe'
import { createVillage } from '../domains/village'
import { type GameWorld, type WorldTile } from '../engine/world-contract'
import { type TileGrid } from '../game'
import { createTile, type TileState } from '../tile/tile'
import { isWaterTerrain, type TileTerrain } from '../tile/tile-terrain'
import { type ReadonlyData } from '../type-utils'
import { Board, type BoardPosition } from './board'
import { createGenerationWorld } from './generation-world'
import { GameHex } from './hex-utils'
import {
	chooseCapitalPositions,
	establishWorldStartingTerritories,
	mapSettings
} from './starting-territories'

export interface BoardGenerationParams {
	numberOfTiles: number
	numberOfVillages: number
	numberOfRuins: number
	maximumRuins?: number
	numberOfPrimaryBuildings: number
	numberOfResources: number
	playerTribe: Tribe
	numberOfOpponents: number
	gameTribes?: readonly Tribe[]
	seed?: number
}

function shuffleWithRng<T>(items: readonly T[], rng: Prando): T[] {
	const result = [...items]
	for (let i = result.length - 1; i > 0; i--) {
		const j = rng.nextInt(0, i)
		const left = result[i]
		const right = result[j]
		if (left === undefined || right === undefined) {
			throw new Error('Sparse generation candidates')
		}
		result[i] = right
		result[j] = left
	}
	return result
}

function geometry(radius: number): TileGrid {
	const size = 2 * radius + 1
	const rows: (TileState | null)[][] = Array.from({ length: size }, () =>
		Array.from({ length: size }, () => null)
	)
	for (const hex of new Grid(GameHex, spiral({ radius }))) {
		const row = rows[hex.r + radius]
		if (row) {
			row[hex.q + radius] = createTile({ r: hex.r, q: hex.q })
		}
	}
	return rows
}

/** Water seeds consume a full Fisher-Yates shuffle, including discarded candidates. */
function carveWater(world: GameWorld, board: Board, rng: Prando) {
	const count = rng.nextInt(
		GAME_CONFIG.WATER_SEED_RANGE.min,
		GAME_CONFIG.WATER_SEED_RANGE.max
	)
	const seeds = shuffleWithRng(
		world.tiles().map(({ at }) => at),
		rng
	).slice(0, count)
	const directions = [
		Direction.E,
		Direction.NE,
		Direction.NW,
		Direction.W,
		Direction.SW,
		Direction.SE
	]
	for (let i = 0; i < seeds.length - 1; i++) {
		const a = seeds[i]
		const b = seeds[i + 1]
		if (!a || !b) {
			continue
		}
		const from = { q: a.q_idx - board.radius, r: a.r_idx - board.radius }
		const to = { q: b.q_idx - board.radius, r: b.r_idx - board.radius }
		const minQ = Math.min(from.q, to.q) - 3
		const maxQ = Math.max(from.q, to.q) + 3
		const minR = Math.min(from.r, to.r) - 3
		const maxR = Math.max(from.r, to.r) + 3
		const hexes = Array.from({ length: maxQ - minQ + 1 }, (_, q) =>
			Array.from(
				{ length: maxR - minR + 1 },
				(_row, r) => new GameHex([minQ + q, minR + r])
			)
		).flat()
		const grid = new Grid(GameHex, hexes)
		for (const hex of grid.traverse(
			line({ start: [from.q, from.r], stop: [to.q, to.r] })
		)) {
			for (const water of [
				hex,
				...directions.map((direction) =>
					grid.neighborOf(hex, direction, { allowOutside: true })
				)
			]) {
				world.updateTile(
					{ q_idx: water.q + board.radius, r_idx: water.r + board.radius },
					{ terrain: 'water' }
				)
			}
		}
	}
	// Classify before writing: an earlier ocean must not change a later neighbor test.
	const interior = world
		.tiles()
		.filter(
			({ at, tile }) =>
				tile.terrain === 'water' &&
				board
					.neighborsOf(at)
					.every((neighbor) => world.tile(neighbor)?.terrain === 'water')
		)
	for (const { at } of interior) {
		world.updateTile(at, { terrain: 'ocean' })
	}
}

function allocateTerrain(
	world: GameWorld,
	board: Board,
	terrains: TileTerrain[],
	rng: Prando
): number {
	const land = world.tiles().filter(({ tile }) => !isWaterTerrain(tile.terrain))
	const remaining = land.map(({ at }) => at)
	const seeds: { at: BoardPosition; terrain: TileTerrain }[] = []
	for (const terrain of terrains) {
		if (remaining.length === 0) {
			break
		}
		let selected: BoardPosition | undefined
		if (seeds.length === 0) {
			selected = remaining[rng.nextInt(0, remaining.length - 1)]
		} else {
			const candidates = shuffleWithRng(remaining, rng).slice(
				0,
				Math.min(GAME_CONFIG.PLACEMENT_CANDIDATE_SAMPLE_SIZE, remaining.length)
			)
			let distance = -Infinity
			for (const candidate of candidates) {
				const nearest = Math.min(
					...seeds.map((seed) => board.distance(candidate, seed.at))
				)
				if (nearest > distance) {
					selected = candidate
					distance = nearest
				}
			}
		}
		if (!selected) {
			continue
		}
		remaining.splice(remaining.indexOf(selected), 1)
		seeds.push({ at: selected, terrain })
	}
	if (seeds.length === 0) {
		return land.length
	}
	const quota = new Map(
		seeds.map(({ terrain }, i) => [
			terrain,
			Math.floor(land.length / seeds.length) +
				(i < land.length % seeds.length ? 1 : 0)
		])
	)
	const counts = new Map(seeds.map(({ terrain }) => [terrain, 0]))
	const candidates = land.map(({ at }) => ({
		at,
		distances: seeds.map((seed) => ({
			terrain: seed.terrain,
			distance: board.distance(at, seed.at)
		}))
	}))
	candidates.sort(
		(a, b) =>
			Math.min(...a.distances.map((d) => d.distance)) -
			Math.min(...b.distances.map((d) => d.distance))
	)
	for (const { at, distances } of candidates) {
		const available = distances
			.toSorted((a, b) => a.distance - b.distance)
			.find(
				({ terrain }) => (counts.get(terrain) ?? 0) < (quota.get(terrain) ?? 0)
			)
		const terrain =
			available?.terrain ??
			seeds
				.map((seed) => seed.terrain)
				.reduce((least, candidate) =>
					(counts.get(candidate) ?? 0) < (counts.get(least) ?? 0)
						? candidate
						: least
				)
		world.updateTile(at, { terrain })
		counts.set(terrain, (counts.get(terrain) ?? 0) + 1)
	}
	return land.length
}

type TerrainPositions = Map<TileTerrain, BoardPosition[]>

function groupTerrain(
	world: GameWorld,
	terrains: TileTerrain[]
): TerrainPositions {
	const groups = new Map(
		terrains.map((terrain): [TileTerrain, BoardPosition[]] => [terrain, []])
	)
	for (const { at, tile } of world.tiles()) {
		groups.get(tile.terrain)?.push(at)
	}
	return groups
}

function villagePositions(world: GameWorld) {
	return world
		.tiles()
		.flatMap(({ at, tile }) => (tile.item?.type === 'village' ? [at] : []))
}

function placeVillages(
	world: GameWorld,
	board: Board,
	groups: TerrainPositions,
	terrains: TileTerrain[],
	count: number,
	rng: Prando
) {
	const allowedTerrains = new Set(terrains)
	const candidates = [...groups.values()].flat().filter((at) => {
		const tile = world.tile(at)
		return tile && allowedTerrains.has(tile.terrain) && !tile.item && !tile.unit
	})
	const ordered = shuffleWithRng(candidates, rng)
	const placed = villagePositions(world)
	for (const at of ordered) {
		if (placed.length >= count) {
			break
		}
		if (!placed.every((other) => board.distance(at, other) >= 4)) {
			continue
		}
		const tile = world.tile(at)
		if (!tile || tile.item) {
			continue
		}
		world.updateTile(at, { item: createVillage(0) })
		placed.push(at)
	}
}

interface Placement {
	count: number
	terrains: TileTerrain[]
	eligible: (tile: ReadonlyData<TileState>) => boolean
	write: (tile: ReadonlyData<TileState>) => Partial<WorldTile>
	villages: BoardPosition[]
}

function distribute(
	world: GameWorld,
	board: Board,
	groups: TerrainPositions,
	rng: Prando,
	placement: Placement
) {
	for (const [index, terrain] of placement.terrains.entries()) {
		const count =
			Math.floor(placement.count / placement.terrains.length) +
			(index < placement.count % placement.terrains.length ? 1 : 0)
		const candidates = (groups.get(terrain) ?? []).filter((at) => {
			const tile = world.tile(at)
			return (
				tile &&
				!tile.unit &&
				placement.eligible(tile) &&
				(placement.villages.length === 0 ||
					placement.villages.some(
						(village) => board.distance(at, village) <= 2
					))
			)
		})
		for (const at of shuffleWithRng(candidates, rng).slice(0, count)) {
			const tile = world.tile(at)
			if (tile && !tile.unit && placement.eligible(tile)) {
				world.updateTile(at, placement.write(tile))
			}
		}
	}
}

function populate(
	world: GameWorld,
	board: Board,
	groups: TerrainPositions,
	terrains: TileTerrain[],
	landTerrains: TileTerrain[],
	landCount: number,
	params: BoardGenerationParams,
	rng: Prando
) {
	placeVillages(
		world,
		board,
		groups,
		landTerrains,
		params.numberOfVillages,
		rng
	)
	const villages = villagePositions(world)
	const ruinCount = rng.nextInt(
		params.numberOfRuins,
		params.maximumRuins ?? params.numberOfRuins
	)
	const ruinCandidates = [...groups.values()].flat().filter((at) => {
		const tile = world.tile(at)
		return tile && !tile.item && !tile.unit && !isWaterTerrain(tile.terrain)
	})
	for (const at of shuffleWithRng(ruinCandidates, rng).slice(0, ruinCount)) {
		world.updateTile(at, { item: createRuins(rng) })
	}
	distribute(world, board, groups, rng, {
		count: params.numberOfPrimaryBuildings,
		terrains,
		villages,
		eligible: (tile) => !tile.item,
		write: (tile) => {
			const choices = primaryBuildings.filter((building) =>
				primaryBuildingToTerrains[building].includes(tile.terrain)
			)
			if (choices.length === 0) {
				return {}
			}
			const value = rng.nextArrayItem(choices)
			return {
				item: { type: 'primaryBuilding', value, state: 'idle', tribe: null }
			}
		}
	})
	distribute(world, board, groups, rng, {
		count: params.numberOfResources,
		terrains: landTerrains,
		villages,
		eligible: (tile) => !tile.item,
		write: (tile) => {
			const choices = resources.filter(
				(resource) => resourceToTerrain[resource] === tile.terrain
			)
			if (choices.length === 0) {
				return {}
			}
			const value = rng.nextArrayItem(choices)
			return { item: { type: 'resource', value } }
		}
	})
	distribute(world, board, groups, rng, {
		count: Math.floor(landCount * GAME_CONFIG.MOUNTAIN_PERCENTAGE),
		terrains: landTerrains,
		villages: [],
		eligible: (tile) => !tile.item && !tile.unit,
		write: () => ({ isMountain: true })
	})
	for (const { at, tile } of world.tiles()) {
		if (tile.item || tile.isMountain || !isObstacleTerrain(tile.terrain)) {
			continue
		}
		if (
			villages.some(
				(village) =>
					board.distance(at, village) <=
					GAME_CONFIG.OBSTACLE_VILLAGE_CARVEOUT_DISTANCE
			)
		) {
			continue
		}
		if (rng.next() < GAME_CONFIG.OBSTACLE_SPAWN_CHANCE) {
			world.updateTile(at, { obstacle: terrainToObstacleKind[tile.terrain] })
		}
	}
}

/** The phase order and candidate order are part of the seeded map format. */
export function generateBoard(params: BoardGenerationParams) {
	const seed = params.seed ?? Date.now()
	const rng = new Prando(seed)
	const gameTribes = params.gameTribes ?? [
		params.playerTribe,
		...shuffleWithRng(
			tribes.filter((tribe) => tribe !== params.playerTribe),
			rng
		).slice(0, params.numberOfOpponents)
	]
	if (
		gameTribes.length === 0 ||
		new Set(gameTribes).size !== gameTribes.length
	) {
		throw new Error('Board generation requires distinct tribes')
	}
	const terrains: TileTerrain[] = [
		...new Set<TileTerrain>([
			...gameTribes.map((tribe) => tribeToTerrain[tribe]),
			'water',
			'ocean'
		])
	]
	const landTerrains = terrains.filter((terrain) => !isWaterTerrain(terrain))
	const radius = Math.max(
		2,
		Math.round((Math.sqrt(12 * params.numberOfTiles - 3) - 3) / 6)
	)
	const tiles = geometry(radius)
	const board = Board.from(tiles)
	const capitals = chooseCapitalPositions(
		tiles,
		gameTribes.length,
		mapSettings(gameTribes.length).minimumCapitalDistance,
		rng
	)
	if (!capitals) {
		throw new Error('Too many players for the requested board size')
	}
	const world = createGenerationWorld(tiles, params.playerTribe, seed)
	carveWater(world, board, rng)
	const landCount = allocateTerrain(world, board, landTerrains, rng)
	establishWorldStartingTerritories(world, board, gameTribes, capitals, rng)
	const groups = groupTerrain(world, terrains)
	populate(world, board, groups, terrains, landTerrains, landCount, params, rng)
	const generated = world.snapshot()
	return {
		board: generated.units.board,
		unitStates: generated.units.unitStates,
		nextUnitId: generated.nextUnitId,
		seed
	}
}
