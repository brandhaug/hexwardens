import {
	createTestBoard,
	createTestGameState,
	createTestVillage,
	createTestUnit,
	createTestUnitState
} from '@hexwardens/game-logic/test/game-test-helpers'
import { updateTile } from '@hexwardens/game-logic/tile/tile'
import { unitsLow } from '@hexwardens/game-logic/units/registry'
import { actionDockMessage } from './action-dock-message'

const at = { q_idx: 2, r_idx: 2 }

it('explains exhausted units instead of suggesting another command', () => {
	const state = createTestGameState({ board: createTestBoard(2) })
	const unit = createTestUnit('barbarians', 'caveman')
	state.units = unitsLow.spawn(
		state.units,
		at,
		unit,
		createTestUnitState(at, 'caveman', { mode: 'acted' })
	)
	expect(actionDockMessage(state, 'barbarians', at)).toContain(
		'Ready next turn'
	)
})

it('explains full city capacity', () => {
	const board = updateTile(createTestBoard(2), at, {
		item: createTestVillage('barbarians', { population: 2, maxPopulation: 2 })
	})
	expect(
		actionDockMessage(createTestGameState({ board }), 'barbarians', at)
	).toContain('population is full')
})

it('explains the technology blocking a visible resource', () => {
	let board = updateTile(createTestBoard(2), at, {
		item: createTestVillage('barbarians')
	})
	const resource = { q_idx: 3, r_idx: 2 }
	board = updateTile(board, resource, {
		terrain: 'stone',
		item: { type: 'resource', value: 'gem' }
	})
	expect(
		actionDockMessage(createTestGameState({ board }), 'barbarians', resource)
	).toContain('Research')
})
