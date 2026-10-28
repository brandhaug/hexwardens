import { Result } from 'effect'
import { dispatch } from '../dispatch'
import { executeCommittedIntent } from '../action-execution'
import {
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../test/game-test-helpers'
import { updateTile } from '../tile/tile'

it('publishes recruitment once and keeps both successful and denied command inputs detached', () => {
	const home = { q_idx: 3, r_idx: 3 }
	const board = updateTile(
		updateTile(createTestBoard(3), home, {
			item: createTestVillage('barbarians')
		}),
		{ q_idx: 5, r_idx: 3 },
		{ item: createTestVillage('rogues') }
	)
	const source = createTestGameState({ board })
	const before = structuredClone(source)
	const intent = {
		kind: 'tileAction',
		action: { kind: 'train', at: home, unit: 'caveman' }
	} satisfies Parameters<typeof dispatch>[2]
	const success = Result.getOrThrow(
		executeCommittedIntent(source, 'barbarians', intent)
	)
	expect(source).toEqual(before)
	const published = structuredClone(success.nextState)
	expect(
		Result.isFailure(dispatch(success.nextState, 'barbarians', intent))
	).toBe(true)
	expect(success.nextState).toEqual(published)
	const village = success.nextState.units.board[3]?.[3]?.item
	expect(village?.type === 'village' ? village.population : null).toBe(1)
	expect(success.nextState.nextUnitId).toBe(source.nextUnitId + 1)
	expect(
		Result.getOrThrow(dispatch(source, 'barbarians', intent)).nextState.units
	).toEqual(success.nextState.units)
})
