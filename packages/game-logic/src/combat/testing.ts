import { type BoardPosition } from '../board/board'
import { GameHex } from '../board/hex-utils'
import { type Tribe } from '../domains/tribe'
import { type Unit, type UnitState, type UnitType } from '../domains/unit'
import { type GameState } from '../game'
import {
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState
} from '../test/game-test-helpers'
import { type TileState } from '../tile/tile'
import { type TileTerrain } from '../tile/tile-terrain.ts'
import { type UnitStateRecord } from '../unit-state-utils'
import { type CombatGrid } from './types'

export type CombatantSpec = {
	tribe: Tribe
	type: UnitType
	pos: BoardPosition
	state?: Partial<UnitState>
}

export type ScenarioSpec = {
	radius?: number
	attacker: CombatantSpec
	defender: CombatantSpec
	extras?: CombatantSpec[]
	terrain?: Partial<Record<`${number},${number}`, TileTerrain>>
	gameStateOverrides?: Partial<GameState>
}

export type Scenario = {
	gameState: GameState
	grid: CombatGrid
	attacker: Unit
	attackerPos: BoardPosition
	defender: Unit
	defenderPos: BoardPosition
	extras: Unit[]
}

/**
 * Build a GameState scenario for combat tests. Places the attacker, defender,
 * and any extras on a fresh test board and wires up their unit states.
 *
 * Terrain overrides are keyed by "q,r" tile coordinates.
 */
export function buildCombatScenario(spec: ScenarioSpec): Scenario {
	const radius = spec.radius ?? 2
	const board = createTestBoard(radius)

	if (spec.terrain) {
		for (const [key, terrain] of Object.entries(spec.terrain)) {
			if (!terrain) {
				continue
			}
			const [qStr, rStr] = key.split(',')
			const q = Number(qStr)
			const r = Number(rStr)
			const tile = board[r]?.[q]
			if (tile) {
				const row = board[r]
				if (row) {
					row[q] = { ...tile, terrain }
				}
			}
		}
	}

	const attacker = createTestUnit(spec.attacker.tribe, spec.attacker.type)
	const defender = createTestUnit(spec.defender.tribe, spec.defender.type)
	placeUnit(board, attacker, spec.attacker.pos)
	placeUnit(board, defender, spec.defender.pos)

	const unitStates: UnitStateRecord = {
		[attacker.id]: createTestUnitState(
			spec.attacker.pos,
			spec.attacker.type,
			spec.attacker.state
		),
		[defender.id]: createTestUnitState(
			spec.defender.pos,
			spec.defender.type,
			spec.defender.state
		)
	}

	const extras: Unit[] = []
	for (const extra of spec.extras ?? []) {
		const unit = createTestUnit(extra.tribe, extra.type)
		placeUnit(board, unit, extra.pos)
		unitStates[unit.id] = createTestUnitState(
			extra.pos,
			extra.type,
			extra.state
		)
		extras.push(unit)
	}

	const gameState = createTestGameState({
		units: { board, unitStates },
		currentPlayerTribe: spec.attacker.tribe,
		...spec.gameStateOverrides
	})

	return {
		gameState,
		grid: { gameHex: GameHex, radius },
		attacker,
		attackerPos: spec.attacker.pos,
		defender,
		defenderPos: spec.defender.pos,
		extras
	}
}

function placeUnit(
	board: (TileState | null)[][],
	unit: Unit,
	pos: BoardPosition
) {
	const tile = board[pos.r_idx]?.[pos.q_idx]
	if (!tile) {
		throw new Error(`No tile at ${pos.q_idx},${pos.r_idx}`)
	}
	const row = board[pos.r_idx]
	if (row) {
		row[pos.q_idx] = { ...tile, unit }
	}
}
