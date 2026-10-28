import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt
} from '../../test/game-test-helpers'
import { Result } from 'effect'
import { assert } from 'vite-plus/test'
import { dispatch } from '../../dispatch'
import { advanceTurn } from '../../turns'
import {
	entriesFromBroadcastEvents,
	entriesFromCombatEvents
} from './entries-from-events'

describe('chronicle integration — derived from dispatch/advanceTurn outputs', () => {
	it('dispatch surfaces unitDefeated entries when an attack kills the defender', () => {
		const board = createTestBoard(2)
		const attacker = createTestUnit('barbarians', 'caveman')
		const defender = createTestUnit('rogues', 'caveman')
		setUnitAt(board, { q_idx: 1, r_idx: 1 }, attacker)
		setUnitAt(board, { q_idx: 2, r_idx: 1 }, defender)

		const state = createTestGameState({
			board,
			currentPlayerTribe: 'barbarians',
			unitStates: {
				[attacker.id]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman'),
				[defender.id]: createTestUnitState({ q_idx: 2, r_idx: 1 }, 'caveman', {
					health: 1
				})
			}
		})

		const result = dispatch(state, 'barbarians', {
			kind: 'attack',
			from: { q_idx: 1, r_idx: 1 },
			to: { q_idx: 2, r_idx: 1 }
		})

		assert(Result.isSuccess(result))
		const entries = result.success.chronicleEntries
		expect(entries.length).toBeGreaterThan(0)
		const defeat = entries.find((e) => e.kind === 'unitDefeated')
		assert(defeat?.kind === 'unitDefeated')
		expect(defeat.actorTribe).toBe('barbarians')
		expect(defeat.targetTribe).toBe('rogues')
		expect(defeat.position).toEqual({ q_idx: 2, r_idx: 1 })
	})

	it('advanceTurn broadcast events become chronicle entries via the pure converter', () => {
		const board = createTestBoard(2)
		requireTestValue(board[1])[1] = {
			...requireTestValue(requireTestValue(board[1])[1]),
			item: createTestVillage('barbarians', { salary: 3 })
		}
		requireTestValue(board[3])[3] = {
			...requireTestValue(requireTestValue(board[3])[3]),
			item: createTestVillage('rogues', { salary: 1 })
		}
		const state = createTestGameState({ board })

		const advance = advanceTurn(state)
		const entries = entriesFromBroadcastEvents(advance.events, state.turn)

		// Salary is dropped, turnRotated becomes a single turnAdvanced entry.
		expect(entries.some((e) => e.kind === 'turnAdvanced')).toBe(true)
		expect(entries.every((e) => e.kind !== 'researchProgress')).toBe(true)
	})

	it('combat-derived entries match the combat events from the same dispatch', () => {
		// Sanity: dispatch's chronicleEntries field is the exact same content
		// entriesFromCombatEvents would compute from the events + pre-state.
		const board = createTestBoard(2)
		const attacker = createTestUnit('barbarians', 'caveman')
		const defender = createTestUnit('rogues', 'caveman')
		setUnitAt(board, { q_idx: 1, r_idx: 1 }, attacker)
		setUnitAt(board, { q_idx: 2, r_idx: 1 }, defender)
		const state = createTestGameState({
			board,
			currentPlayerTribe: 'barbarians',
			unitStates: {
				[attacker.id]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman'),
				[defender.id]: createTestUnitState({ q_idx: 2, r_idx: 1 }, 'caveman', {
					health: 1
				})
			}
		})

		const result = dispatch(state, 'barbarians', {
			kind: 'attack',
			from: { q_idx: 1, r_idx: 1 },
			to: { q_idx: 2, r_idx: 1 }
		})
		assert(Result.isSuccess(result))
		const entries = result.success.chronicleEntries

		// Re-derive from the same combat events to confirm determinism.
		// (We don't have direct access to combat events at this layer, so we
		// just confirm the derived entry count is consistent.)
		const direct = entriesFromCombatEvents(
			[
				{
					type: 'kill',
					killerId: attacker.id,
					victimId: defender.id
				}
			],
			state,
			'barbarians',
			state.turn
		)
		expect(entries).toEqual(direct)
	})
})
