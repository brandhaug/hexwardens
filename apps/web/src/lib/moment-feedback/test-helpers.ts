import { type VillageLevel } from '@hexwardens/game-logic/domains/village'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tech } from '@hexwardens/game-logic/domains/tech'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type UnitId, type UnitType } from '@hexwardens/game-logic/domains/unit'
import { type GameState } from '@hexwardens/game-logic/game'
import {
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt
} from '@hexwardens/game-logic/test/game-test-helpers'

/**
 * Mutable counter for generated unit ids — kept module-local so each test
 * file gets a fresh sequence beginning at `unit_0`.
 */
let testUnitIdCounter = 0

function nextUnitId(): UnitId {
	const id: UnitId = `unit_${testUnitIdCounter}`
	testUnitIdCounter += 1
	return id
}

export function makeGameState(): GameState {
	testUnitIdCounter = 0
	return createTestGameState()
}

export function placeUnit(
	state: GameState,
	tribe: Tribe,
	type: UnitType,
	health: number,
	at: BoardPosition
): GameState {
	const unitId = nextUnitId()
	const unit = createTestUnit(tribe, type, unitId)
	const board = state.units.board.map((row) => [...row])
	setUnitAt(board, at, unit)
	const unitState = createTestUnitState(at, type, { health })
	return {
		...state,
		units: {
			board,
			unitStates: { ...state.units.unitStates, [unitId]: unitState }
		}
	}
}

export function placeVillage(
	state: GameState,
	tribe: Tribe,
	at: BoardPosition
): GameState {
	const village = createTestVillage(tribe)
	const board = state.units.board.map((row, r_idx) =>
		row.map((tile, q_idx) => {
			if (r_idx !== at.r_idx || q_idx !== at.q_idx || !tile) {
				return tile
			}
			return { ...tile, item: village }
		})
	)
	return { ...state, units: { ...state.units, board } }
}

export function setUnitHealth(
	state: GameState,
	unitId: UnitId,
	health: number
): GameState {
	const existing = state.units.unitStates[unitId]
	if (!existing) {
		throw new Error(`unitId not found: ${unitId}`)
	}
	return {
		...state,
		units: {
			...state.units,
			unitStates: {
				...state.units.unitStates,
				[unitId]: { ...existing, health }
			}
		}
	}
}

export function setMoney(
	state: GameState,
	tribe: Tribe,
	money: number
): GameState {
	const player = state.playerStates[tribe]
	return {
		...state,
		playerStates: {
			...state.playerStates,
			[tribe]: { ...player, money }
		}
	}
}

export function setVillageLevel(
	state: GameState,
	at: BoardPosition,
	level: number
): GameState {
	const board = state.units.board.map((row, r_idx) =>
		row.map((tile, q_idx) => {
			if (r_idx !== at.r_idx || q_idx !== at.q_idx || !tile) {
				return tile
			}
			if (tile.item?.type !== 'village') {
				return tile
			}
			// Cast through unknown only via constructor — we know it's a Village.
			const village = tile.item
			return {
				...tile,
				item: { ...village, level: levelToVillageLevel(level) }
			}
		})
	)
	return { ...state, units: { ...state.units, board } }
}

function levelToVillageLevel(level: number): VillageLevel {
	if (
		level === 1 ||
		level === 2 ||
		level === 3 ||
		level === 4 ||
		level === 5 ||
		level === 6 ||
		level === 7 ||
		level === 8 ||
		level === 9 ||
		level === 10 ||
		level === 11 ||
		level === 12 ||
		level === 13
	) {
		return level
	}
	throw new Error(`Invalid village level: ${level}`)
}

export function setResearchedTechs(
	state: GameState,
	tribe: Tribe,
	techs: Tech[]
): GameState {
	const player = state.playerStates[tribe]
	return {
		...state,
		playerStates: {
			...state.playerStates,
			[tribe]: { ...player, researchedTechs: techs }
		}
	}
}
