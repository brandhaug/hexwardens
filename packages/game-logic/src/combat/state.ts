import { Result } from 'effect'
import {
	InvalidTargetError,
	OutOfRangeError,
	UnitNotReadyError
} from '../actions/action-errors'
import { type BoardPosition } from '../board/board'
import { type Tech } from '../domains/tech'
import {
	getEffectiveMaxHealth,
	getEffectiveUnitStatsForTerrain,
	type Unit,
	type UnitState,
	type UnitStats
} from '../domains/unit'
import { type GameState } from '../game'
import { getPlayerState } from '../player/player-state'
import { type TileState } from '../tile/tile'
import { getEffectiveRangeWithTech, hexDistance } from './range'
import { type CombatError, type CombatGrid } from './types'

const combatStateBrand: unique symbol = Symbol('combatState')

export type Combatant = {
	readonly unit: Unit
	readonly pos: BoardPosition
	readonly tile: TileState
	readonly state: UnitState
	readonly stats: UnitStats
	readonly maxHp: number
	readonly techs: readonly Tech[]
}

type CombatStateFields = {
	readonly gameState: GameState
	readonly grid: CombatGrid
	readonly attacker: Combatant
	readonly defender: Combatant
	readonly isCounterAttack: boolean
}

export type CombatState = CombatStateFields & {
	readonly [combatStateBrand]: true
}

function seal(fields: CombatStateFields): CombatState {
	return { ...fields, [combatStateBrand]: true }
}

function makeCombatant(
	gameState: GameState,
	pos: BoardPosition,
	tile: TileState & { unit: Unit },
	unitState: UnitState
): Combatant {
	const unit = tile.unit
	return {
		unit,
		pos,
		tile,
		state: unitState,
		stats: getEffectiveUnitStatsForTerrain(unit.type, tile.terrain),
		maxHp: getEffectiveMaxHealth(unit.type, unitState),
		techs:
			getPlayerState(gameState.playerStates, unit.tribe)?.researchedTechs ?? []
	}
}

export function validate(
	gameState: GameState,
	attackerPos: BoardPosition,
	defenderPos: BoardPosition,
	grid: CombatGrid
): Result.Result<CombatState, CombatError> {
	const { board, unitStates } = gameState.units
	const attackerTile = board[attackerPos.r_idx]?.[attackerPos.q_idx]
	const defenderTile = board[defenderPos.r_idx]?.[defenderPos.q_idx]

	if (!attackerTile?.unit || !defenderTile?.unit) {
		return Result.fail(
			new InvalidTargetError({
				message: 'Combat requires both attacker and defender units'
			})
		)
	}
	if (attackerTile.unit.tribe !== gameState.currentPlayerTribe) {
		return Result.fail(
			new InvalidTargetError({
				message: 'Cannot attack with a unit you do not control'
			})
		)
	}
	if (attackerTile.unit.tribe === defenderTile.unit.tribe) {
		return Result.fail(
			new InvalidTargetError({ message: 'Cannot attack allied units' })
		)
	}

	const attackerState = unitStates[attackerTile.unit.id]
	if (!attackerState) {
		return Result.fail(
			new InvalidTargetError({ message: 'Attacker has no unit state' })
		)
	}
	const defenderState = unitStates[defenderTile.unit.id]
	if (!defenderState) {
		return Result.fail(
			new InvalidTargetError({ message: 'Defender has no unit state' })
		)
	}

	const attackerStats = getEffectiveUnitStatsForTerrain(
		attackerTile.unit.type,
		attackerTile.terrain
	)
	if (attackerState.mode === 'acted') {
		return Result.fail(
			new UnitNotReadyError({ message: 'Unit has already acted this turn' })
		)
	}
	if (attackerState.mode === 'retreat') {
		return Result.fail(
			new UnitNotReadyError({ message: 'Unit can only retreat-move' })
		)
	}
	if (attackerState.mode === 'moved' && !attackerStats.canAttackAfterMove) {
		return Result.fail(
			new UnitNotReadyError({ message: 'Unit cannot attack after moving' })
		)
	}

	const effectiveRange = getEffectiveRangeWithTech(
		attackerTile.unit.type,
		getPlayerState(gameState.playerStates, attackerTile.unit.tribe)
			?.researchedTechs ?? [],
		attackerTile.terrain
	)
	const distance = hexDistance(
		attackerPos,
		defenderPos,
		grid.gameHex,
		grid.radius
	)
	if (distance > effectiveRange) {
		return Result.fail(
			new OutOfRangeError({
				message: `Target is out of range (distance ${distance}, range ${effectiveRange})`
			})
		)
	}

	const attackerTileWithUnit: TileState & { unit: Unit } = {
		...attackerTile,
		unit: attackerTile.unit
	}
	const defenderTileWithUnit: TileState & { unit: Unit } = {
		...defenderTile,
		unit: defenderTile.unit
	}

	return Result.succeed(
		seal({
			gameState,
			grid,
			attacker: makeCombatant(
				gameState,
				attackerPos,
				attackerTileWithUnit,
				attackerState
			),
			defender: makeCombatant(
				gameState,
				defenderPos,
				defenderTileWithUnit,
				defenderState
			),
			isCounterAttack: false
		})
	)
}

/**
 * Swap attacker/defender on an already-validated CombatState. Used to compute
 * counter-attack damage without re-running validation. Optional overrides let
 * the caller reflect mid-combat changes (new HP, new position).
 */
export function swapRoles(
	state: CombatState,
	overrides?: {
		gameState?: GameState
		newAttackerHealth?: number
		newDefenderPos?: BoardPosition
		newDefenderTile?: TileState
	}
): CombatState {
	const gameState = overrides?.gameState ?? state.gameState
	const newAttacker: Combatant = {
		...state.defender,
		state:
			overrides?.newAttackerHealth === undefined
				? state.defender.state
				: {
						...(gameState.units.unitStates[state.defender.unit.id] ??
							state.defender.state),
						health: overrides.newAttackerHealth
					}
	}
	const newDefender: Combatant = {
		...state.attacker,
		pos: overrides?.newDefenderPos ?? state.attacker.pos,
		tile: overrides?.newDefenderTile ?? state.attacker.tile
	}
	return seal({
		gameState,
		grid: state.grid,
		attacker: newAttacker,
		defender: newDefender,
		isCounterAttack: true
	})
}
