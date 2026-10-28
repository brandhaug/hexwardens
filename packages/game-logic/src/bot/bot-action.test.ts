import { Result } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { GameHex } from '../board/hex-utils'
import { type BoardPosition } from '../board/board'
import {
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt,
	withUnits
} from '../test/game-test-helpers'
import { executeBotAction } from './bot-turn'
import { type BotActionPlan } from './bot-types'

function scenarioWithUnit(tribe: 'barbarians' | 'rogues' = 'barbarians') {
	const board = createTestBoard(3)
	const unit = createTestUnit(tribe, 'caveman')
	const unitPos: BoardPosition = { q_idx: 3, r_idx: 3 }
	setUnitAt(board, unitPos, unit)
	const state = withUnits(createTestGameState({ currentPlayerTribe: tribe }), {
		board,
		unitStates: { [unit.id]: createTestUnitState(unitPos, 'caveman') }
	})
	return { state, unit, unitPos }
}

describe('executeBotAction — move', () => {
	it('moves a friendly unit to an adjacent tile and commits fog', () => {
		const { state, unit, unitPos } = scenarioWithUnit('barbarians')
		const to: BoardPosition = { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		const plan: BotActionPlan = {
			kind: 'move',
			unitId: unit.id,
			from: unitPos,
			to
		}

		const result = executeBotAction(state, plan, 'barbarians', GameHex)

		expect(Result.isSuccess(result)).toBe(true)
		assert(Result.isSuccess(result))
		const next = result.success
		// Destination tile now has the unit; source tile is empty.
		expect(next.units.board[to.r_idx]?.[to.q_idx]?.unit?.id).toBe(unit.id)
		expect(
			next.units.board[unitPos.r_idx]?.[unitPos.q_idx]?.unit ?? null
		).toBeNull()
	})

	it('returns Err when the source tile has no unit', () => {
		const { state, unit } = scenarioWithUnit('barbarians')
		const plan: BotActionPlan = {
			kind: 'move',
			unitId: unit.id,
			from: { q_idx: 0, r_idx: 0 },
			to: { q_idx: 1, r_idx: 0 }
		}

		const result = executeBotAction(state, plan, 'barbarians', GameHex)
		expect(Result.isFailure(result)).toBe(true)
	})
})

describe('executeBotAction — attack', () => {
	it('resolves combat on a valid adjacent enemy', () => {
		const board = createTestBoard(3)
		const attacker = createTestUnit('barbarians', 'caveman')
		const defender = createTestUnit('rogues', 'caveman')
		const attackerPos: BoardPosition = { q_idx: 3, r_idx: 3 }
		const defenderPos: BoardPosition = { q_idx: 4, r_idx: 3 }
		setUnitAt(board, attackerPos, attacker)
		setUnitAt(board, defenderPos, defender)
		const state = withUnits(
			createTestGameState({ currentPlayerTribe: 'barbarians' }),
			{
				board,
				unitStates: {
					[attacker.id]: createTestUnitState(attackerPos, 'caveman'),
					[defender.id]: createTestUnitState(defenderPos, 'caveman')
				}
			}
		)
		const plan: BotActionPlan = {
			kind: 'attack',
			unitId: attacker.id,
			from: attackerPos,
			target: defenderPos
		}

		const result = executeBotAction(state, plan, 'barbarians', GameHex)

		expect(Result.isSuccess(result)).toBe(true)
	})

	it('returns Err when the attack target is invalid', () => {
		const { state, unit, unitPos } = scenarioWithUnit('barbarians')
		const plan: BotActionPlan = {
			kind: 'attack',
			unitId: unit.id,
			from: unitPos,
			// No enemy at this tile — resolveCombat rejects.
			target: { q_idx: unitPos.q_idx + 1, r_idx: unitPos.r_idx }
		}

		const result = executeBotAction(state, plan, 'barbarians', GameHex)
		expect(Result.isFailure(result)).toBe(true)
	})
})

describe('executeBotAction — tileAction', () => {
	it('initiates capture on an enemy village when the unit is on it and within range', () => {
		const board = createTestBoard(3)
		// Place a friendly village so `isWithinVillageRange` passes.
		const villagePos: BoardPosition = { q_idx: 3, r_idx: 3 }
		const enemyVillagePos: BoardPosition = { q_idx: 4, r_idx: 3 }
		const villageRow = board[villagePos.r_idx]
		if (!villageRow) {
			throw new Error('village row missing')
		}
		const villageTile = villageRow[villagePos.q_idx]
		if (!villageTile) {
			throw new Error('village tile missing')
		}
		villageRow[villagePos.q_idx] = {
			...villageTile,
			item: createTestVillage('barbarians')
		}
		// Place a barbarians unit on a capturable (null-tribe) village.
		const unit = createTestUnit('barbarians', 'caveman')
		const enemyRow = board[enemyVillagePos.r_idx]
		if (!enemyRow) {
			throw new Error('enemy row missing')
		}
		const enemyTile = enemyRow[enemyVillagePos.q_idx]
		if (!enemyTile) {
			throw new Error('enemy tile missing')
		}
		enemyRow[enemyVillagePos.q_idx] = {
			...enemyTile,
			unit,
			item: createTestVillage(null)
		}
		const state = withUnits(
			createTestGameState({ currentPlayerTribe: 'barbarians' }),
			{
				board,
				unitStates: {
					[unit.id]: createTestUnitState(enemyVillagePos, 'caveman')
				}
			}
		)

		const plan: BotActionPlan = {
			kind: 'tileAction',
			action: { kind: 'capture', at: enemyVillagePos }
		}

		const result = executeBotAction(state, plan, 'barbarians', GameHex)

		expect(Result.isSuccess(result)).toBe(true)
		assert(Result.isSuccess(result))
		// Two-step capture: ownership doesn't flip yet — only a setup marker is
		// placed. The flip happens at the start of the capturing tribe's next
		// turn (see `turns/index.ts` `captureFlip` phase).
		const capturedTile =
			result.success.units.board[enemyVillagePos.r_idx]?.[enemyVillagePos.q_idx]
		expect(capturedTile?.item?.type).toBe('village')
		assert(capturedTile?.item?.type === 'village')
		expect(capturedTile.item.tribe).toBe(null)
		expect(capturedTile.item.captureSetup).toEqual({
			byTribe: 'barbarians',
			turnInitiated: state.turn
		})
	})

	it('returns Err when no tile exists at the position', () => {
		const { state } = scenarioWithUnit('barbarians')
		const plan: BotActionPlan = {
			kind: 'tileAction',
			action: { kind: 'capture', at: { q_idx: 999, r_idx: 999 } }
		}

		const result = executeBotAction(state, plan, 'barbarians', GameHex)
		expect(Result.isFailure(result)).toBe(true)
	})
})
