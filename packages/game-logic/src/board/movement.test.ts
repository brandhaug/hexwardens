import { requireTestValue } from '../test/game-test-helpers'
import { describe, expect, it } from 'vite-plus/test'
import { Board } from './board'
import { isReachable, canStopOn, type TerrainGates } from './movement'
import { type TileState } from '../tile/tile'

const ALL_OPEN: TerrainGates = {
	canEnterWater: true,
	canEnterOcean: true,
	canEnterMountain: true
}
const ALL_CLOSED: TerrainGates = {
	canEnterWater: false,
	canEnterOcean: false,
	canEnterMountain: false
}

const land = (terrain: TileState['terrain'], isMountain = false) =>
	({ terrain, isMountain }) as const

describe('canStopOn', () => {
	it('always allows non-mountain land terrains regardless of gates', () => {
		expect(canStopOn(land('grass'), ALL_CLOSED)).toBe(true)
		expect(canStopOn(land('forest'), ALL_CLOSED)).toBe(true)
		expect(canStopOn(land('desert'), ALL_CLOSED)).toBe(true)
		expect(canStopOn(land('stone'), ALL_CLOSED)).toBe(true)
	})

	it('gates mountains by canEnterMountain regardless of underlying terrain', () => {
		expect(canStopOn(land('stone', true), ALL_OPEN)).toBe(true)
		expect(canStopOn(land('stone', true), ALL_CLOSED)).toBe(false)
		expect(canStopOn(land('grass', true), ALL_CLOSED)).toBe(false)
		expect(canStopOn(land('forest', true), ALL_CLOSED)).toBe(false)
		expect(
			canStopOn(land('grass', true), { ...ALL_CLOSED, canEnterMountain: true })
		).toBe(true)
	})

	it('gates shallow water by canEnterWater', () => {
		expect(canStopOn(land('water'), ALL_OPEN)).toBe(true)
		expect(canStopOn(land('water'), ALL_CLOSED)).toBe(false)
		expect(
			canStopOn(land('water'), { ...ALL_CLOSED, canEnterWater: true })
		).toBe(true)
	})

	it('gates ocean by canEnterOcean specifically', () => {
		expect(canStopOn(land('ocean'), ALL_OPEN)).toBe(true)
		expect(canStopOn(land('ocean'), ALL_CLOSED)).toBe(false)
		expect(
			canStopOn(land('ocean'), { ...ALL_CLOSED, canEnterWater: true })
		).toBe(false)
		expect(
			canStopOn(land('ocean'), { ...ALL_CLOSED, canEnterOcean: true })
		).toBe(true)
	})
})

function tile(
	terrain: TileState['terrain'],
	overrides: Partial<TileState> = {}
): TileState {
	return {
		hex: { q: 0, r: 0, s: 0 },
		terrain,
		obstacle: null,
		item: null,
		unit: null,
		isMountain: false,
		...overrides
	}
}

function grassBoard(size: number): (TileState | null)[][] {
	const rows: TileState[][] = []
	for (let r = 0; r < size; r += 1) {
		const row: TileState[] = []
		for (let q = 0; q < size; q += 1) {
			row.push(tile('grass'))
		}
		rows.push(row)
	}
	return rows
}

describe('isReachable BFS', () => {
	it('reaches an adjacent grass tile within budget', () => {
		const board = Board.from(grassBoard(5))
		const reachable = isReachable(
			{
				board,
				source: { q_idx: 2, r_idx: 2 },
				maxMovement: 1,
				isFlying: false,
				isStartOnLand: true,
				gates: ALL_OPEN
			},
			{ q_idx: 3, r_idx: 2 }
		)
		expect(reachable).toBe(true)
	})

	it('refuses targets beyond the movement budget', () => {
		const board = Board.from(grassBoard(7))
		const reachable = isReachable(
			{
				board,
				source: { q_idx: 3, r_idx: 3 },
				maxMovement: 1,
				isFlying: false,
				isStartOnLand: true,
				gates: ALL_OPEN
			},
			{ q_idx: 5, r_idx: 3 }
		)
		expect(reachable).toBe(false)
	})

	it('obstacles hard-block ground units even within budget', () => {
		const tiles = grassBoard(5)
		// Insert an Obstacle on the only adjacent tile in the direction of travel.
		requireTestValue(tiles[2])[3] = tile('grass', { obstacle: 'boulder' })
		const board = Board.from(tiles)
		const reachable = isReachable(
			{
				board,
				source: { q_idx: 2, r_idx: 2 },
				maxMovement: 2,
				isFlying: false,
				isStartOnLand: true,
				gates: ALL_OPEN
			},
			{ q_idx: 3, r_idx: 2 }
		)
		expect(reachable).toBe(false)
	})

	it('flying units skip in-transit terrain gates', () => {
		const tiles = grassBoard(5)
		requireTestValue(tiles[2])[3] = tile('grass', { isMountain: true }) // mountain in transit
		const board = Board.from(tiles)
		const reachable = isReachable(
			{
				board,
				source: { q_idx: 2, r_idx: 2 },
				maxMovement: 3,
				isFlying: true,
				isStartOnLand: true,
				// Mountain gate is closed — flying ignores it for transit.
				gates: { ...ALL_CLOSED, canEnterMountain: false }
			},
			{ q_idx: 4, r_idx: 2 }
		)
		expect(reachable).toBe(true)
	})
})

describe('weighted movement routes', () => {
	it('keeps a cheaper later route through the same tile', () => {
		const layout = ['#1211', '211#1', '112#1', '11221', '1#11#']
		const board = Board.from(
			layout.map((row) =>
				// oxlint-disable-next-line typescript/no-misused-spread -- Fixture cells use only ASCII digits and #.
				[...row].map((cell) =>
					tile('grass', {
						isMountain: cell === '2',
						obstacle: cell === '#' ? 'boulder' : null
					})
				)
			)
		)
		const context = {
			board,
			source: { q_idx: 1, r_idx: 3 },
			maxMovement: 5,
			isFlying: false,
			isStartOnLand: true,
			gates: ALL_OPEN
		}
		expect(isReachable(context, { q_idx: 4, r_idx: 1 })).toBe(true)
		expect(
			isReachable({ ...context, maxMovement: 4 }, { q_idx: 4, r_idx: 1 })
		).toBe(false)
	})
})
