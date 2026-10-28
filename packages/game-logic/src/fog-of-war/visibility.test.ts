import { Result } from 'effect'
import { buildInitialGameState } from '../match/init'
import { allBotConfig } from '../match/test-helpers'
import { mergeIncomingExploration, snapshotFor } from './snapshot'
import { visibleTileIdsFor } from './visibility'

it('keeps current sight equivalent on authority and a fogged viewer projection', () => {
	const initial = buildInitialGameState({ ...allBotConfig(), seed: 7 })
	assert(Result.isSuccess(initial))
	const tribe = initial.success.currentPlayerTribe
	const initialSight = snapshotFor(initial.success, tribe)
	const unseen = initial.success.units.board.flatMap((row, r_idx) =>
		row.flatMap((tile, q_idx) =>
			tile && !initialSight.visibleTileIds.has(`${q_idx},${r_idx}`)
				? [`${q_idx},${r_idx}`]
				: []
		)
	)
	const previouslyExplored = unseen[0]
	assert(previouslyExplored)
	const state = mergeIncomingExploration(initial.success, {
		tribe,
		tiles: [previouslyExplored]
	})
	const authoritative = snapshotFor(state, tribe)
	assert(Result.isSuccess(authoritative.projected))
	const viewer = authoritative.projected.success
	expect(viewer.units.board.flat().some((tile) => tile?.terrain === null)).toBe(
		true
	)
	expect(authoritative.visibleTileIds.size).toBeGreaterThan(0)
	expect([...visibleTileIdsFor(viewer, tribe)]).toEqual([
		...authoritative.visibleTileIds
	])
	expect([...visibleTileIdsFor(state, tribe)]).toEqual([
		...authoritative.visibleTileIds
	])
	expect(visibleTileIdsFor(viewer, tribe).has(previouslyExplored)).toBe(false)
})
