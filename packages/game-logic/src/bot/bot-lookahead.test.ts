import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	withUnits
} from '../test/game-test-helpers'
import { Result } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { executeMovement } from '../units/world-movement'
import { scoreMoveLookaheadActions } from './bot-lookahead'
import { fixtureOf } from './scorers/scorer-test-helpers'

function fixtureFor(
	gs: ReturnType<typeof createTestGameState>,
	tribe: 'barbarians' | 'rogues' = 'barbarians'
) {
	return fixtureOf(gs, tribe, { positionalAwareness: true, lookahead: true })
}

describe('scoreMoveLookaheadActions', () => {
	it('returns no actions for tribes with no ready units', () => {
		const gs = createTestGameState({ board: createTestBoard(3) })
		expect(scoreMoveLookaheadActions(fixtureFor(gs))).toEqual([])
	})

	it('skips units that have already moved this turn', () => {
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 3, r_idx: 3 }
		const unit = createTestUnit('barbarians', 'caveman')
		const board = gs.units.board.map((row) => [...row])
		requireTestValue(board[from.r_idx])[from.q_idx] = {
			...requireTestValue(requireTestValue(board[from.r_idx])[from.q_idx]),
			unit
		}
		gs = withUnits(gs, {
			board,
			unitStates: {
				[unit.id]: createTestUnitState(from, 'caveman', { mode: 'moved' })
			}
		})
		expect(scoreMoveLookaheadActions(fixtureFor(gs))).toEqual([])
	})

	it('never produces a move that executeMovement rejects (no ghost actions)', () => {
		let gs = createTestGameState({ board: createTestBoard(3) })
		const unitAPos = { q_idx: 3, r_idx: 3 }
		const unitBPos = { q_idx: 4, r_idx: 3 }
		const enemyPos = { q_idx: 2, r_idx: 2 }

		const friendlyA = createTestUnit('barbarians', 'caveman')
		const friendlyB = createTestUnit('barbarians', 'seer')
		const enemy = createTestUnit('rogues', 'caveman')

		const board = gs.units.board.map((row) => [...row])
		requireTestValue(board[unitAPos.r_idx])[unitAPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitAPos.r_idx])[unitAPos.q_idx]
			),
			unit: friendlyA
		}
		requireTestValue(board[unitBPos.r_idx])[unitBPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitBPos.r_idx])[unitBPos.q_idx]
			),
			unit: friendlyB
		}
		requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx]
			),
			unit: enemy,
			item: createTestVillage('rogues')
		}
		gs = withUnits(gs, {
			board,
			unitStates: {
				[friendlyA.id]: createTestUnitState(unitAPos, 'caveman'),
				[friendlyB.id]: createTestUnitState(unitBPos, 'seer'),
				[enemy.id]: createTestUnitState(enemyPos, 'caveman')
			}
		})

		const actions = scoreMoveLookaheadActions(fixtureFor(gs))
		expect(actions.length).toBeGreaterThan(0)

		for (const action of actions) {
			const plan = action.execute()
			if (plan.kind !== 'move') {
				continue
			}
			const result = executeMovement(gs, plan.from, plan.to)
			expect(Result.isSuccess(result)).toBe(true)
		}
	})

	it('respects tech-passive movement bonuses when enumerating moves', () => {
		// With sprinter tech, a sprinter should produce extra lookahead targets
		// reachable only with the +1 bonus.
		let baseline = createTestGameState({ board: createTestBoard(4) })
		const from = { q_idx: 4, r_idx: 4 }
		const sprinter = createTestUnit('barbarians', 'sprinter')
		const board = baseline.units.board.map((row) => [...row])
		requireTestValue(board[from.r_idx])[from.q_idx] = {
			...requireTestValue(requireTestValue(board[from.r_idx])[from.q_idx]),
			unit: sprinter
		}
		baseline = withUnits(baseline, {
			board,
			unitStates: {
				[sprinter.id]: createTestUnitState(from, 'sprinter')
			}
		})

		const withoutKnightTech = scoreMoveLookaheadActions(
			fixtureFor(baseline)
		).length

		const boosted = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					researchedTechs: ['sprinter' as const]
				}
			}
		}
		const withKnightTech = scoreMoveLookaheadActions(fixtureFor(boosted)).length

		expect(withKnightTech).toBeGreaterThan(withoutKnightTech)
	})
})
