import { Board } from './board'
import { tribes, tribeToTribeStats, tribeToTerrain } from '../domains/tribe'
import { isWaterTerrain } from '../tile/tile-terrain'
import { mapSettings } from './starting-territories'
import {
	isObstacleTerrain,
	obstacleTerrains,
	terrainToObstacleKind
} from '../domains/obstacle'
import { generateBoard } from './generate-board'

describe('generateBoard — water/ocean split', () => {
	const params = {
		numberOfTiles: 91,
		numberOfVillages: 5,
		numberOfRuins: 2,
		numberOfPrimaryBuildings: 8,
		numberOfResources: 8,
		playerTribe: 'barbarians' as const,
		numberOfOpponents: 2,
		seed: 1_234_567
	}

	it('produces both water and ocean tiles for a fixed seed', () => {
		const { board } = generateBoard(params)
		const flat = board.flat().filter((t) => t !== null)
		const water = flat.filter((t) => t.terrain === 'water').length
		const ocean = flat.filter((t) => t.terrain === 'ocean').length

		expect(water).toBeGreaterThan(0)
		expect(ocean).toBeGreaterThan(0)
	})

	it('keeps shallow water adjacent to land somewhere on the board', () => {
		const { board } = generateBoard(params)
		const size = board.length

		const hasShallowAdjacentToLand = board.some((row, r_idx) =>
			row.some((tile, q_idx) => {
				if (tile?.terrain !== 'water') {
					return false
				}
				const neighbors: [number, number][] = [
					[r_idx - 1, q_idx],
					[r_idx + 1, q_idx],
					[r_idx, q_idx - 1],
					[r_idx, q_idx + 1]
				]
				return neighbors.some(([nr, nq]) => {
					if (nr < 0 || nr >= size || nq < 0 || nq >= size) {
						return false
					}
					const neighbor = board[nr]?.[nq]
					return (
						neighbor !== null &&
						neighbor !== undefined &&
						neighbor.terrain !== 'water' &&
						neighbor.terrain !== 'ocean'
					)
				})
			})
		)
		expect(hasShallowAdjacentToLand).toBe(true)
	})

	it('never places pearl resources on ocean tiles', () => {
		const { board } = generateBoard(params)
		const flat = board.flat().filter((t) => t !== null)
		const clamOnOcean = flat.filter(
			(t) =>
				t.terrain === 'ocean' &&
				t.item?.type === 'resource' &&
				t.item.value === 'pearl'
		)
		expect(clamOnOcean).toHaveLength(0)
	})

	it('places tavern primary buildings on water and never on ocean', () => {
		const { board } = generateBoard(params)
		const flat = board.flat().filter((t) => t !== null)

		const tavernOnOcean = flat.filter(
			(t) =>
				t.terrain === 'ocean' &&
				t.item?.type === 'primaryBuilding' &&
				t.item.value === 'tavern'
		)
		expect(tavernOnOcean).toHaveLength(0)

		const taverns = flat.filter(
			(t) => t.item?.type === 'primaryBuilding' && t.item.value === 'tavern'
		)
		for (const tile of taverns) {
			expect(tile.terrain).toBe('water')
		}
	})
})

describe('generateBoard — obstacles', () => {
	const params = {
		numberOfTiles: 169,
		numberOfVillages: 5,
		numberOfRuins: 2,
		numberOfPrimaryBuildings: 8,
		numberOfResources: 8,
		playerTribe: 'barbarians' as const,
		numberOfOpponents: 2,
		seed: 1_234_567
	}

	it('spawns at least one obstacle on a populated land board', () => {
		const { board } = generateBoard(params)
		const hasObstacle = board.flat().some((t) => t?.obstacle !== null)
		expect(hasObstacle).toBe(true)
	})

	it('only places obstacles on eligible land terrains', () => {
		const { board } = generateBoard(params)
		const flat = board.flat().filter((t) => t !== null)

		for (const tile of flat) {
			if (tile.obstacle === null) {
				continue
			}
			// `assert` keeps the original "must be eligible terrain" check while
			// narrowing `tile.terrain` for the obstacle-kind table lookup.
			assert(isObstacleTerrain(tile.terrain))
			expect(tile.obstacle).toBe(terrainToObstacleKind[tile.terrain])
		}
	})

	it('never places obstacles on tiles carrying items', () => {
		const { board } = generateBoard(params)
		const flat = board.flat().filter((t) => t !== null)
		const obstacleWithItem = flat.filter(
			(t) => t.obstacle !== null && t.item !== null
		)
		expect(obstacleWithItem).toHaveLength(0)
	})

	it('never places obstacles on mountain tiles', () => {
		const { board } = generateBoard(params)
		const flat = board.flat().filter((t) => t !== null)
		const obstacleOnMountain = flat.filter(
			(t) => t.obstacle !== null && t.isMountain
		)
		expect(obstacleOnMountain).toHaveLength(0)
	})

	it('honours the village carveout: no obstacle within distance 2 of any starting village', () => {
		const { board } = generateBoard(params)
		const size = board.length

		// Axial hex distance — same formula honeycomb-grid uses internally.
		// Board indices are translated to axial via `q - radius, r - radius`
		// in generateBoard; the radius cancels for pairwise distances.
		const hexDistance = (
			a: { q_idx: number; r_idx: number },
			b: { q_idx: number; r_idx: number }
		): number => {
			const dq = a.q_idx - b.q_idx
			const dr = a.r_idx - b.r_idx
			return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
		}

		const villages: Array<{ r_idx: number; q_idx: number }> = []
		for (let r_idx = 0; r_idx < size; r_idx++) {
			const row = board[r_idx]
			if (!row) {
				continue
			}
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				const tile = row[q_idx]
				if (tile?.item?.type === 'village' && tile.item.tribe !== null) {
					villages.push({ r_idx, q_idx })
				}
			}
		}
		expect(villages.length).toBeGreaterThan(0)

		for (let r_idx = 0; r_idx < size; r_idx++) {
			const row = board[r_idx]
			if (!row) {
				continue
			}
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				const tile = row[q_idx]
				if (!tile || tile.obstacle === null) {
					continue
				}
				for (const v of villages) {
					expect(hexDistance({ q_idx, r_idx }, v)).toBeGreaterThan(2)
				}
			}
		}
	})

	it('exposes every terrain in obstacleTerrains in the kind map', () => {
		for (const terrain of obstacleTerrains) {
			expect(terrainToObstacleKind[terrain]).toBeDefined()
		}
	})
})

describe('generateBoard — seed determinism', () => {
	const params = {
		numberOfTiles: 91,
		numberOfVillages: 5,
		numberOfRuins: 2,
		numberOfPrimaryBuildings: 8,
		numberOfResources: 8,
		playerTribe: 'barbarians' as const,
		numberOfOpponents: 2,
		gameTribes: ['barbarians' as const, 'rogues' as const]
	}

	it('produces an identical board for the same seed', () => {
		const a = generateBoard({ ...params, seed: 42 })
		const b = generateBoard({ ...params, seed: 42 })

		expect(b.board).toEqual(a.board)
		expect(b.nextUnitId).toBe(a.nextUnitId)
		expect(b.seed).toBe(a.seed)
	})

	it('produces a different board for a different seed', () => {
		const a = generateBoard({ ...params, seed: 42 })
		const b = generateBoard({ ...params, seed: 43 })

		expect(b.board).not.toEqual(a.board)
	})
})

describe('generated starting territories', () => {
	it.each(
		[
			{ count: 3, tiles: 60, hexes: 61 },
			{ count: 4, tiles: 100, hexes: 91 },
			{ count: 5, tiles: 180, hexes: 169 }
		].flatMap(({ count, tiles, hexes }) =>
			Array.from({ length: 12 }, (_, seed) => ({ count, seed, tiles, hexes }))
		)
	)(
		'guarantees complete, separated starts for $count tribes with seed $seed',
		({ count, seed, tiles, hexes }) => {
			const offset = seed % tribes.length
			const gameTribes = [
				...tribes.slice(offset),
				...tribes.slice(0, offset)
			].slice(0, count)
			const result = generateBoard({
				numberOfTiles: tiles,
				numberOfVillages: count * 3,
				numberOfRuins: mapSettings(count).ruins.min,
				maximumRuins: mapSettings(count).ruins.max,
				numberOfPrimaryBuildings: 10,
				numberOfResources: 10,
				playerTribe: 'barbarians',
				numberOfOpponents: count - 1,
				gameTribes,
				seed
			})
			const board = Board.from(result.board)
			expect([...board.entries()]).toHaveLength(hexes)
			const villages = [...board.entries()].filter(
				([, tile]) => tile.item?.type === 'village'
			)
			const capitals = villages.filter(
				([, tile]) =>
					tile.item?.type === 'village' && tile.item.kind === 'capital'
			)
			expect(capitals).toHaveLength(count)
			for (const tribe of gameTribes) {
				const capital = capitals.find(
					([, tile]) =>
						tile.item?.type === 'village' && tile.item.tribe === tribe
				)
				assert(capital)
				const [position, tile] = capital
				expect(tile.terrain).toBe(tribeToTerrain[tribe])
				const units = [...board.entries()].filter(
					([, entry]) => entry.unit?.tribe === tribe
				)
				const stats = tribeToTribeStats[tribe]
				expect(
					units
						.map(([, entry]) => entry.unit?.type)
						.toSorted((a, b) => (a ?? '').localeCompare(b ?? ''))
				).toEqual(
					[
						stats.primaryUnit,
						...(stats.secondaryUnit ? [stats.secondaryUnit] : [])
					].toSorted((a, b) => a.localeCompare(b))
				)
				assert(tile.item?.type === 'village')
				expect(tile.item.population).toBe(units.length)
				for (const [unitPosition, entry] of units) {
					expect(board.distance(position, unitPosition)).toBeLessThanOrEqual(1)
					expect(
						isWaterTerrain(entry.terrain) ||
							entry.isMountain ||
							entry.obstacle !== null
					).toBe(false)
				}
				const food = board.neighborsOf(position).filter((neighbor) => {
					const entry = board.at(neighbor)
					return (
						entry?.item?.type === 'resource' &&
						entry.item.value === 'wheat' &&
						entry.terrain === 'grass'
					)
				})
				expect(food).toHaveLength(2)
				const otherCapitals = capitals.filter(
					([other]) => board.key(position) !== board.key(other)
				)
				for (const [other] of otherCapitals) {
					expect(board.distance(position, other)).toBeGreaterThanOrEqual(
						mapSettings(count).minimumCapitalDistance
					)
				}
			}
			for (const [i, [position]] of villages.entries()) {
				for (const [other] of villages.slice(i + 1)) {
					expect(board.distance(position, other)).toBeGreaterThanOrEqual(4)
				}
			}
			const ruins = [...board.entries()].filter(
				([, tile]) => tile.item?.type === 'ruins'
			)
			expect(ruins.length).toBeGreaterThanOrEqual(mapSettings(count).ruins.min)
			expect(ruins.length).toBeLessThanOrEqual(mapSettings(count).ruins.max)
			for (const [, tile] of ruins) {
				expect(isWaterTerrain(tile.terrain)).toBe(false)
			}
			const ids = [...board.entries()].flatMap(([, tile]) =>
				tile.unit ? [tile.unit.id] : []
			)
			expect(new Set(ids).size).toBe(ids.length)
			expect(result.nextUnitId).toBe(ids.length + 1)
		}
	)
})
