import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { unitToUnitStats, type Unit } from '@hexwardens/game-logic/domains/unit'
import { type Village } from '@hexwardens/game-logic/domains/village'
import { type FilteredGameState } from '@hexwardens/game-logic/multiplayer/types'
import { type TileGrid, type TileState } from '@hexwardens/game-logic/tile/tile'
import { deriveStateDiffAudioEvents } from './state-diff-events'

function emptyTile(r: number, q: number): TileState {
	return {
		hex: { q, r, s: -q - r },
		terrain: 'grass',
		item: null,
		unit: null,
		isMountain: false,
		obstacle: null
	}
}

function unit(tribe: Tribe, id: number): Unit {
	return {
		id: `unit_${id}`,
		tribe,
		type: 'caveman',
		stats: unitToUnitStats.caveman
	}
}

function village(tribe: Tribe | null): Village {
	return {
		type: 'village',
		state: 'built',
		kind: 'regular',
		level: 1,
		tribe,
		experience: 0,
		experienceToNextLevel: 2,
		perks: [],
		population: 0,
		maxPopulation: 2,
		range: 1,
		salary: 1,
		captureSetup: null
	}
}

function makeBoard(rows: number, cols: number): TileGrid {
	const out: (TileState | null)[][] = []
	for (let r = 0; r < rows; r++) {
		const row: (TileState | null)[] = []
		for (let q = 0; q < cols; q++) {
			row.push(emptyTile(r, q))
		}
		out.push(row)
	}
	return out
}

function placeUnit(board: TileGrid, r: number, q: number, u: Unit): TileGrid {
	const next = board.map((row) => [...row])
	const row = next[r]
	const tile = row?.[q]
	if (row && tile) {
		row[q] = { ...tile, unit: u }
	}
	return next
}

function placeVillage(
	board: TileGrid,
	r: number,
	q: number,
	v: Village
): TileGrid {
	const next = board.map((row) => [...row])
	const row = next[r]
	const tile = row?.[q]
	if (row && tile) {
		row[q] = { ...tile, item: v }
	}
	return next
}

function state(board: TileGrid): FilteredGameState {
	return {
		units: { board, unitStates: {} },
		turn: 1,
		playerStates: {},
		currentPlayerTribe: 'barbarians',
		eliminatedTribes: [],
		isGameOver: false,
		winner: null,
		nextUnitId: 100,
		pendingVillageLevelUps: {},
		pendingPerkChoices: {}
	}
}

describe('deriveStateDiffAudioEvents', () => {
	test('a strict drop in unit count emits one unitDeath cue', () => {
		const before = state(
			placeUnit(makeBoard(3, 3), 0, 0, unit('barbarians', 1))
		)
		const after = state(makeBoard(3, 3))
		const out = deriveStateDiffAudioEvents(before, after, 'barbarians')
		expect(out).toContainEqual({
			kind: 'unitDeath',
			localPlayerInvolved: true
		})
	})

	test('death of an opponent unit only flags localPlayerInvolved when the local tribe is involved', () => {
		const before = state(placeUnit(makeBoard(3, 3), 0, 0, unit('rogues', 2)))
		const after = state(makeBoard(3, 3))
		const out = deriveStateDiffAudioEvents(before, after, 'barbarians')
		expect(out).toContainEqual({
			kind: 'unitDeath',
			localPlayerInvolved: false
		})
	})

	test('a village changing hands without elimination emits villageCaptured', () => {
		const beforeBoard = placeVillage(makeBoard(3, 3), 0, 0, village('rogues'))
		const beforeBoard2 = placeVillage(beforeBoard, 0, 1, village('rogues'))
		const afterBoard = placeVillage(
			makeBoard(3, 3),
			0,
			0,
			village('barbarians')
		)
		const afterBoard2 = placeVillage(afterBoard, 0, 1, village('rogues'))
		const out = deriveStateDiffAudioEvents(
			state(beforeBoard2),
			state(afterBoard2),
			'barbarians'
		)
		expect(out).toContainEqual({
			kind: 'villageCaptured',
			capturedByLocalPlayer: true
		})
	})

	test('the last village of a tribe falling emits capitalCaptured', () => {
		const before = state(placeVillage(makeBoard(3, 3), 0, 0, village('rogues')))
		const after = state(
			placeVillage(makeBoard(3, 3), 0, 0, village('barbarians'))
		)
		const out = deriveStateDiffAudioEvents(before, after, 'barbarians')
		expect(out).toContainEqual({
			kind: 'capitalCaptured',
			capturedByLocalPlayer: true
		})
	})

	test('no diff produces no events', () => {
		const board = placeUnit(
			placeVillage(makeBoard(3, 3), 0, 0, village('rogues')),
			1,
			1,
			unit('rogues', 5)
		)
		expect(
			deriveStateDiffAudioEvents(state(board), state(board), 'barbarians')
		).toEqual([])
	})

	test('a village built (count grows) for the local tribe emits buildComplete', () => {
		const before = state(makeBoard(3, 3))
		const after = state(
			placeVillage(makeBoard(3, 3), 0, 0, village('barbarians'))
		)
		const out = deriveStateDiffAudioEvents(before, after, 'barbarians')
		expect(out).toContainEqual({ kind: 'buildComplete', tribe: 'barbarians' })
	})

	test('a village built by an opponent does not emit buildComplete for the local player', () => {
		const before = state(makeBoard(3, 3))
		const after = state(placeVillage(makeBoard(3, 3), 0, 0, village('rogues')))
		const out = deriveStateDiffAudioEvents(before, after, 'barbarians')
		expect(out).not.toContainEqual(
			expect.objectContaining({ kind: 'buildComplete' })
		)
	})
})
