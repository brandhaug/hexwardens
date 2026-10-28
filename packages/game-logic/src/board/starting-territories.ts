import type Prando from 'prando'
import { type Tribe, tribeToTerrain, tribeToTribeStats } from '../domains/tribe'
import { unitToUnitStats, type Unit, type UnitType } from '../domains/unit'
import { freshUnitState } from '../units/world-units'
import { createVillage } from '../domains/village'
import { type TileGrid } from '../tile/tile'
import { Board, type BoardPosition } from './board'
import { type GameWorld } from '../engine/world-contract'

/** Recovered MapConfig values; CenterSize and continent weights are not interpreted. */
export function mapSettings(playerCount: number) {
	const opponents = Math.max(1, playerCount - 1)
	const minimumCapitalDistance =
		[4, 4, 5, 5, 7, 7, 8, 8, 8, 9, 10][opponents] ?? 10
	const minimumRuins = opponents === 1 ? 2 : Math.floor(opponents / 2) + 2
	return {
		minimumCapitalDistance,
		ruins: { min: minimumRuins, max: minimumRuins + 1 }
	}
}

/** Farthest-first placement with seeded tie breaking and a fixed-board packing fallback. */
export function chooseCapitalPositions(
	tiles: TileGrid,
	count: number,
	minimumDistance: number,
	rng: Prando
): BoardPosition[] | null {
	const board = Board.from(tiles)
	const candidates = [...board.positions()].flatMap((position) => {
		const neighbors = board.neighborsOf(position)
		return neighbors.length === 6 &&
			neighbors.every((neighbor) => board.at(neighbor) !== null)
			? [{ position, tie: rng.next() }]
			: []
	})
	const chosen: BoardPosition[] = []
	while (chosen.length < count) {
		const ranked = candidates
			.flatMap((candidate) => {
				const distance =
					chosen.length === 0
						? board.distance(candidate.position, {
								q_idx: board.radius,
								r_idx: board.radius
							})
						: Math.min(
								...chosen.map((other) =>
									board.distance(candidate.position, other)
								)
							)
				return chosen.length === 0 || distance >= minimumDistance
					? [{ ...candidate, distance }]
					: []
			})
			.toSorted((a, b) => b.distance - a.distance || b.tie - a.tie)
		const best = ranked[0]
		if (!best) {
			return packCapitals(
				board,
				candidates
					.toSorted((a, b) => b.tie - a.tie)
					.map(({ position }) => position),
				count,
				minimumDistance
			)
		}
		chosen.push(best.position)
	}
	return chosen
}

/** Search compatible subsets when greedy placement blocks an otherwise valid setup. */
function packCapitals(
	board: Board,
	candidates: readonly BoardPosition[],
	count: number,
	minimumDistance: number
): BoardPosition[] | null {
	if (count === 0) {
		return []
	}
	for (const [index, position] of candidates.entries()) {
		if (candidates.length - index < count) {
			return null
		}
		const remaining = candidates
			.slice(index + 1)
			.filter((other) => board.distance(position, other) >= minimumDistance)
		const packed = packCapitals(board, remaining, count - 1, minimumDistance)
		if (packed) {
			return [position, ...packed]
		}
	}
	return null
}

/** Full starting roster and two adjacent research-free harvests per capital. */
export function establishWorldStartingTerritories(
	world: GameWorld,
	board: Board,
	tribes: readonly Tribe[],
	positions: readonly BoardPosition[],
	rng: Prando
) {
	let nextUnitId = 1
	function placeUnit(
		position: BoardPosition,
		tribe: Tribe,
		type: UnitType,
		homeVillage: BoardPosition
	) {
		const unit: Unit = {
			id: `unit_${nextUnitId}`,
			tribe,
			type,
			stats: unitToUnitStats[type]
		}
		world.spawnUnit(unit, freshUnitState(unit, position, { homeVillage }))
		nextUnitId += 1
	}
	for (const [index, tribe] of tribes.entries()) {
		const capital = positions[index]
		if (!capital) {
			throw new Error('Missing reserved capital')
		}
		const terrain = tribeToTerrain[tribe]
		const stats = tribeToTribeStats[tribe]
		const neighbors = board
			.neighborsOf(capital)
			.map((position) => ({ position, tie: rng.next() }))
			.toSorted((a, b) => a.tie - b.tie)
			.map(({ position }) => position)
		for (const position of [capital, ...neighbors]) {
			world.updateTile(position, {
				terrain,
				item: null,
				isMountain: false,
				obstacle: null
			})
		}
		world.updateTile(capital, {
			item: { ...createVillage(stats.secondaryUnit ? 2 : 1, 'capital'), tribe }
		})
		placeUnit(capital, tribe, stats.primaryUnit, capital)
		const secondaryPosition = neighbors[0]
		if (stats.secondaryUnit && secondaryPosition) {
			placeUnit(secondaryPosition, tribe, stats.secondaryUnit, capital)
		}
		// Equal immediate development for every tribe, including those whose home
		// resource needs research. Grass supports wheat without a technology gate.
		for (const position of neighbors.slice(1, 3)) {
			world.updateTile(position, {
				terrain: 'grass',
				item: { type: 'resource', value: 'wheat' }
			})
		}
	}
	world.updateMetadata({ nextUnitId })
}
