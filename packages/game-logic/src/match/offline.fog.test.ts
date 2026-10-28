import { Result } from 'effect'
import { snapshotFor } from '../fog-of-war/snapshot'
import { createOfflineMatch } from './offline'
import { humanVsBotConfig } from './test-helpers'

/**
 * Isomorphism check: the offline path's `snapshotFor` must produce exactly
 * what a manual `snapshotFor(state, tribe).projected` produces on the same
 * authoritative state. A regression that forked the offline projection
 * would show up as a diff here. Board generation is non-deterministic
 * (random seed per init), so we validate the projection against the *same*
 * match's internal state — not a second independently-initialized match.
 */

describe('offline match fog', () => {
	it('snapshotFor returns a per-tribe filtered frame — opponents stripped', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await match.ready()
			const barbarians = match.snapshotFor('barbarians')
			const rogues = match.snapshotFor('rogues')
			expect(barbarians).not.toBeNull()
			expect(rogues).not.toBeNull()
			assert(!(!barbarians || !rogues))

			expect(barbarians.type).toBe('gameState')
			expect(barbarians.state.currentPlayerTribe).toBe('barbarians')

			// Cross-tribe invariant: the non-viewer tribe's exploration and
			// researchInProgress are always stripped from a projected frame.
			const barbariansViewRogues = barbarians.state.playerStates.rogues
			const roguesViewBarbarians = rogues.state.playerStates.barbarians
			expect(barbariansViewRogues?.exploration ?? {}).toEqual({})
			expect(barbariansViewRogues?.researchInProgress ?? null).toBeNull()
			expect(roguesViewBarbarians?.exploration ?? {}).toEqual({})
			expect(roguesViewBarbarians?.researchInProgress ?? null).toBeNull()
		} finally {
			match.destroy()
		}
	})

	it('seed is stripped from every projected frame', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await match.ready()
			const frame = match.snapshotFor('barbarians')
			expect(frame).not.toBeNull()
			assert(frame)
			// `FilteredGameState` omits `seed` by design — projection strips it.
			expect('seed' in frame.state).toBe(false)
		} finally {
			match.destroy()
		}
	})

	it('match.snapshotFor matches a manual snapshotFor(state, tribe).projected — no fork', async () => {
		const match = createOfflineMatch({
			config: humanVsBotConfig(),
			playerTribe: 'barbarians'
		})
		try {
			await match.ready()
			const state = match.getState().gameState
			for (const tribe of ['barbarians', 'rogues'] as const) {
				const expected = snapshotFor(state, tribe).projected
				assert(Result.isSuccess(expected))
				const snap = match.snapshotFor(tribe)
				assert(snap)

				expect(snap.state).toEqual(expected.success)
			}
		} finally {
			match.destroy()
		}
	})
})
