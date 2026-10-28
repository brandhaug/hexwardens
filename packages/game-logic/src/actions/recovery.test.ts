import { planAction, executePlan } from './engine'
import {
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	requireTestValue
} from '../test/game-test-helpers'
import { type Tribe } from '../domains/tribe'

describe('territory recovery', () => {
	it.each<{ owner: Tribe | null; health: number; restored: number }>([
		{ owner: 'barbarians', health: 11, restored: 8 },
		{ owner: 'barbarians', health: 4, restored: 8 },
		{ owner: 'rogues', health: 4, restored: 4 },
		{ owner: null, health: 4, restored: 4 },
		{ owner: 'barbarians', health: 18, restored: 2 }
	])(
		'restores $restored HP at $health HP in $owner territory',
		({ owner, health, restored }) => {
			const board = createTestBoard(2)
			const at = { q_idx: 2, r_idx: 2 }
			const unit = createTestUnit('barbarians', 'caveman')
			const row = requireTestValue(board[2])
			row[2] = { ...requireTestValue(row[2]), unit }
			if (owner) {
				row[1] = { ...requireTestValue(row[1]), item: createTestVillage(owner) }
			}
			const state = createTestGameState({
				board,
				unitStates: {
					[unit.id]: createTestUnitState(at, 'caveman', {
						health,
						mode: 'moved'
					})
				}
			})
			const plan = planAction(state, { kind: 'recover', at })
			assert(plan.kind === 'allowed')
			const result = executePlan(state, plan)
			expect(result.state.units.unitStates[unit.id]?.health).toBe(
				health + restored
			)
			expect(result.state.units.unitStates[unit.id]?.mode).toBe('acted')
			expect(result.message).toContain(`+${restored} HP`)
			expect(state.units.unitStates[unit.id]?.health).toBe(health)
		}
	)
})
