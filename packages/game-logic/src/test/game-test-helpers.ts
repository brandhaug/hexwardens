import { type BoardPosition } from '../board/board'
import { tribes, type Tribe } from '../domains/tribe'
import {
	type Unit,
	type UnitId,
	type UnitState,
	type UnitType,
	unitToUnitStats
} from '../domains/unit'

import { type Village, createVillage } from '../domains/village'

import { type GameState, type TileGrid } from '../game'
import {
	createInitialPlayerStates,
	type PlayerState,
	type PlayerStateRecord
} from '../player/player-state'
import { createTile, type TileState } from '../tile/tile'
import { typedFromEntries } from '../type-utils'
import { type UnitStateRecord } from '../unit-state-utils'

let unitCounter = 0

function createTestUnitId(): UnitId {
	return `unit_test_${++unitCounter}`
}

export function createTestUnit(
	tribe: Tribe,
	type: UnitType,
	id?: UnitId
): Unit {
	return {
		id: id ?? createTestUnitId(),
		type,
		stats: unitToUnitStats[type],
		tribe
	}
}

export function createTestUnitState(
	position: BoardPosition,
	type: UnitType,
	overrides?: Partial<UnitState>
): UnitState {
	return {
		mode: 'ready',
		health: unitToUnitStats[type].health,
		level: 1,
		kills: 0,
		killsThisTurn: 0,
		position,
		debuffs: [],
		veterancyBonusAtk: 0,
		veterancyBonusHp: 0,
		hasBeenAttackedThisTurn: false,
		...overrides
	}
}

export function createTestVillage(
	tribe: Tribe | null,
	overrides?: Partial<Village>
): Village {
	const village = createVillage(0)
	return {
		...village,
		tribe,
		...overrides
	}
}

/**
 * Place a unit at the given position on a test board. Mutates the board in
 * place; use `createTestBoard(radius)` first to get a fresh board. Exists
 * so scenario setups don't need `board[r]![q] = { ...board[r]![q]!, unit }`
 * non-null-assertion chains inline.
 */
export function setUnitAt(
	board: (TileState | null)[][],
	position: BoardPosition,
	unit: Unit
): void {
	const row = board[position.r_idx]
	const tile = row?.[position.q_idx]
	if (!row || !tile) {
		throw new Error(
			`setUnitAt: no tile at (${position.q_idx}, ${position.r_idx})`
		)
	}
	row[position.q_idx] = { ...tile, unit }
}

/**
 * Create a hex board of the given radius filled with grass tiles.
 * Board dimensions: (2*radius + 1) x (2*radius + 1)
 */
export function createTestBoard(radius: number): (TileState | null)[][] {
	const size = 2 * radius + 1
	const board: (TileState | null)[][] = []

	for (let r = 0; r < size; r++) {
		const row: (TileState | null)[] = []
		for (let q = 0; q < size; q++) {
			const hexQ = q - radius
			const hexR = r - radius
			row.push(createTile({ q: hexQ, r: hexR }))
		}
		board.push(row)
	}

	return board
}

/**
 * Create a hex-shaped board of the given radius — the same array shape as
 * {@link createTestBoard} but with the two off-hex corners nulled out so the
 * rendered footprint matches what `generateBoard` produces in production.
 * Visual showcases (e.g. Storybook) prefer this over the parallelogram shape
 * the square test board produces.
 */
export function createTestHexBoard(radius: number): (TileState | null)[][] {
	const board = createTestBoard(radius)
	for (let r_idx = 0; r_idx < board.length; r_idx++) {
		const row = board[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const q = q_idx - radius
			const r = r_idx - radius
			if (Math.abs(q + r) > radius) {
				row[q_idx] = null
			}
		}
	}
	return board
}

/**
 * Build a `PlayerStateRecord` from only the participating tribes — the same
 * structural shape `createInitialPlayerStates` produces in production (the
 * record type is nominally full, but at runtime only participating tribes
 * are present; readers go through `getPlayerState` and handle `undefined`).
 */
export function createTestPlayerStates(players: {
	[T in Tribe]?: PlayerState
}): PlayerStateRecord {
	const entries: [Tribe, PlayerState][] = []
	for (const tribe of tribes) {
		const state = players[tribe]
		if (state) {
			entries.push([tribe, state])
		}
	}
	return typedFromEntries(entries)
}

/**
 * Overrides accepted by {@link createTestGameState}. Accepts either
 * `units: UnitRegistry` (the canonical shape) or flat `board` / `unitStates`
 * for test ergonomics — scenarios often want to supply just one half.
 */
export type TestGameStateOverrides = Partial<Omit<GameState, 'units'>> & {
	units?: Partial<GameState['units']>
	board?: TileGrid
	unitStates?: UnitStateRecord
}

/**
 * Test-only helper: replace board and/or unitStates on a GameState, producing
 * a new registry. Keeps scenario setup terse without dropping immutability.
 */
export function withUnits(
	state: GameState,
	patch: { board?: TileGrid; unitStates?: UnitStateRecord }
): GameState {
	return {
		...state,
		units: {
			board: patch.board ?? state.units.board,
			unitStates: patch.unitStates ?? state.units.unitStates
		}
	}
}

/**
 * Create a minimal valid GameState with sensible defaults.
 * Pass overrides to customize specific fields.
 */
export function createTestGameState(
	overrides?: TestGameStateOverrides
): GameState {
	const radius = 2
	const board = createTestBoard(radius)
	const playerStates: PlayerStateRecord = createInitialPlayerStates([
		{
			tribe: 'barbarians',
			name: 'Player 1',
			money: 5,
			isBot: false,
			difficulty: 'Beginner'
		},
		{
			tribe: 'rogues',
			name: 'Player 2',
			money: 5,
			isBot: true,
			difficulty: 'Beginner'
		}
	])

	const {
		board: boardOverride,
		unitStates: unitStatesOverride,
		units: unitsOverride,
		...rest
	} = overrides ?? {}
	const units: GameState['units'] = {
		board: unitsOverride?.board ?? boardOverride ?? board,
		unitStates: unitsOverride?.unitStates ?? unitStatesOverride ?? {}
	}
	return {
		units,
		turn: 1,
		playerStates,
		currentPlayerTribe: 'barbarians',
		eliminatedTribes: [],
		isGameOver: false,
		winner: null,
		nextUnitId: 1,
		seed: 12_345,
		pendingVillageLevelUps: {},
		pendingPerkChoices: {},
		...rest
	}
}

/** Fail at fixture construction when a scenario references a missing value. */
export function requireTestValue<T>(value: T | null | undefined): T {
	if (value === null || value === undefined) {
		throw new Error('Required test fixture value is missing')
	}
	return value
}
