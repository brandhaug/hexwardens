import { type Hex } from 'honeycomb-grid'
import {
	type InvalidTargetError,
	type OutOfRangeError,
	type UnitNotReadyError
} from '../actions/action-errors'
import { type BoardPosition } from '../board/board'
import { type Unit, type UnitDebuff } from '../domains/unit'
import { type GameState } from '../game'

export type CombatGrid = {
	gameHex: typeof Hex
	radius: number
}

/**
 * Caller-facing input for {@link resolveCombat} / {@link previewCombat}.
 * `from` is the attacker's position, `to` is the defender's position.
 */
export type AttackIntent = {
	from: BoardPosition
	to: BoardPosition
	grid: CombatGrid
}

export type CombatEvent =
	| {
			type: 'attack'
			attackerId: Unit['id']
			defenderId: Unit['id']
			damage: number
	  }
	| {
			type: 'counter'
			attackerId: Unit['id']
			defenderId: Unit['id']
			damage: number
	  }
	| { type: 'kill'; killerId: Unit['id']; victimId: Unit['id'] }
	| { type: 'dodge'; unitId: Unit['id']; context: 'attack' | 'counter' }
	| { type: 'debuff_applied'; targetId: Unit['id']; debuff: UnitDebuff }
	| {
			type: 'knockback'
			attackerId: Unit['id']
			targetId: Unit['id']
			outcome: 'pushed' | 'blocked' | 'drowned'
			from: BoardPosition
			to: BoardPosition
	  }

/**
 * Outcome of a fully-resolved combat. `state` is the new GameState, `events` is
 * an immutable ordered log, and `message` is a human-readable summary.
 */
export type CombatResolution = {
	state: GameState
	events: readonly CombatEvent[]
	message: string
}

export type CombatError =
	| InvalidTargetError
	| UnitNotReadyError
	| OutOfRangeError

/** Read-only damage prediction for UI tooltips and bot scoring. */
export type CombatPreview = {
	expected: number
	counter: number | null
}
