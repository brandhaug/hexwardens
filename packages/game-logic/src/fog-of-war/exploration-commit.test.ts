import { createTestGameState } from '../test/game-test-helpers'
import {
	commitExploration,
	mergeIncomingExploration,
	snapshotFor
} from './snapshot'

it('returns the same committed result for repeated use of a bound snapshot', () => {
	const source = createTestGameState()
	const snapshot = snapshotFor(source, source.currentPlayerTribe)
	const committed = commitExploration(snapshot)
	expect(commitExploration(snapshot)).toBe(committed)
	expect(committed).toBe(source)
})

it('does not publish a new state when an exploration delta is replayed', () => {
	const source = createTestGameState()
	const delta = { tribe: source.currentPlayerTribe, tiles: ['1,1'] }
	const committed = mergeIncomingExploration(source, delta)
	expect(mergeIncomingExploration(committed, delta)).toBe(committed)
	expect(
		source.playerStates[source.currentPlayerTribe]?.exploration['1,1']
	).toBeUndefined()
})
