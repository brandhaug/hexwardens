import { immediatePacer } from '@hexwardens/game-logic/bot/bot-pacer'
import {
	createOfflineMatch,
	type OfflineMatchHandle
} from '@hexwardens/game-logic/match/offline'
import { humanVsBotConfig } from '@hexwardens/game-logic/match/test-helpers'
import { type BroadcastEvent } from '@hexwardens/game-logic/multiplayer/types'
import { createOfflineMatchClient } from './offline-match-client'
import { findIllegalMove, findLegalMove } from '@/test/match-intent-fixtures'

/**
 * Conformance tests for the offline MatchClient adapter, driven against a
 * real in-process offline match (game-logic is pure, so this is cheap). The
 * human is `barbarians`; one `rogues` bot opponent.
 */

function makeMatch(): OfflineMatchHandle {
	return createOfflineMatch({
		// Fixed seed: the intent fixtures probe for legal/illegal moves, and an
		// unseeded board (Date.now) occasionally generates an opening with none.
		config: { ...humanVsBotConfig(), seed: 42 },
		playerTribe: 'barbarians',
		botPacer: immediatePacer
	})
}

describe('createOfflineMatchClient', () => {
	it('locks all input while end-turn persistence is pending and unlocks on failure', async () => {
		let hold = false
		let rejectCommit: (error: Error) => void = () => {
			throw new Error('Missing commit')
		}
		const match = createOfflineMatch({
			config: { ...humanVsBotConfig(), seed: 42 },
			playerTribe: 'barbarians',
			commitLocally: () =>
				hold
					? new Promise<void>((_resolve, reject) => {
							rejectCommit = reject
						})
					: Promise.resolve()
		})
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: false
			})
			const move = findLegalMove(match.getState().gameState, 'barbarians')
			hold = true
			const pending = client.endTurn()
			// oxlint-disable-next-line anti-slop/no-unknown-parameters -- capture an arbitrary promise rejection for the boundary assertion below
			const failed = Promise.resolve(pending).catch((error: unknown) => error)
			expect(client.canAct()).toBe(false)
			expect(await client.submitIntent(move)).toMatchObject({
				accepted: false,
				reason: 'notAllowed'
			})
			await client.endTurn()
			rejectCommit(new Error('quota'))
			expect(await failed).toMatchObject({ _tag: 'PersistenceError' })
			expect(client.canAct()).toBe(true)
		} finally {
			match.destroy()
		}
	})

	it('exposes the authoritative game state and act-gating', async () => {
		const match = makeMatch()
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: false
			})

			expect(client.getGameState()).toBe(match.getState().gameState)
			expect(client.canAct()).toBe(true)
		} finally {
			match.destroy()
		}
	})

	it('publishes a legal Intent after its commit completes', async () => {
		const match = makeMatch()
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: false
			})
			const before = client.getGameState()
			if (!before) {
				throw new Error('expected initial state')
			}
			const move = findLegalMove(before, 'barbarians')
			if (move.kind !== 'move') {
				throw new Error('expected a move intent')
			}

			let notified = 0
			const unsubscribe = client.subscribe(() => {
				notified++
			})
			const submission = await client.submitIntent(move)
			unsubscribe()

			expect(submission.accepted).toBe(true)
			// Completion means the authoritative state already reflects the move.
			const after = client.getGameState()
			if (!after) {
				throw new Error('expected state after move')
			}
			expect(after).not.toBe(before)
			expect(
				after.units.board[move.to.r_idx]?.[move.to.q_idx]?.unit?.tribe
			).toBe('barbarians')
			expect(notified).toBeGreaterThan(0)
		} finally {
			match.destroy()
		}
	})

	it('surfaces the engine rejection for an illegal Intent', async () => {
		const match = makeMatch()
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: false
			})
			const before = client.getGameState()
			if (!before) {
				throw new Error('expected initial state')
			}
			const illegal = findIllegalMove(before)

			const submission = await client.submitIntent(illegal)

			expect(submission.accepted).toBe(false)
			if (submission.accepted) {
				throw new Error('unreachable')
			}
			expect(submission.reason).toBe('invalid')
			expect(submission.message).toBeTruthy()
			// Rejection leaves the authoritative state untouched.
			expect(client.getGameState()).toBe(before)
		} finally {
			match.destroy()
		}
	})

	it('refuses submissions for spectators without touching the match', async () => {
		const match = createOfflineMatch({
			config: { ...humanVsBotConfig(), seed: 42 },
			playerTribe: null,
			botPacer: immediatePacer
		})
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: true
			})
			expect(client.canAct()).toBe(false)

			const state = client.getGameState()
			if (!state) {
				throw new Error('expected state')
			}
			// A spectator submit must short-circuit — `match.send` would throw
			// SpectatorActionError if the adapter reached the transport.
			const submission = await client.submitIntent(
				findLegalMove(state, 'barbarians')
			)
			expect(submission).toEqual({
				accepted: false,
				reason: 'notAllowed',
				message: null
			})
		} finally {
			match.destroy()
		}
	})

	it('endTurn rotates the Turn and gates further submissions', async () => {
		const match = makeMatch()
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: false
			})
			const initialState = client.getGameState()
			if (!initialState) {
				throw new Error('expected state')
			}
			expect(initialState.currentPlayerTribe).toBe('barbarians')

			await client.endTurn()

			// The committed turn belongs to the bot; the human can no longer act.
			const afterEndTurn = client.getGameState()
			if (!afterEndTurn) {
				throw new Error('expected state')
			}
			expect(afterEndTurn.currentPlayerTribe).toBe('rogues')
			expect(client.canAct()).toBe(false)
			const blocked = await client.submitIntent(
				findLegalMove(initialState, 'barbarians')
			)
			expect(blocked).toEqual({
				accepted: false,
				reason: 'notAllowed',
				message: null
			})

			// Drain the bot chain: the Turn comes back around to the human.
			await match.drain()
			const nextTurn = client.getGameState()
			if (!nextTurn) {
				throw new Error('expected state')
			}
			expect(nextTurn.currentPlayerTribe).toBe('barbarians')
			expect(client.canAct()).toBe(true)
		} finally {
			match.destroy()
		}
	}, 15_000)

	it('forwards only turnEvents on the broadcast-event stream', async () => {
		const match = makeMatch()
		try {
			await match.ready()
			const client = createOfflineMatchClient({
				match,
				tribe: 'barbarians',
				spectator: false
			})
			const received: (readonly BroadcastEvent[])[] = []
			const unsubscribe = client.subscribeBroadcastEvents((events) => {
				received.push(events)
			})

			await client.endTurn()
			await match.drain()

			expect(received.length).toBeGreaterThan(0)
			for (const events of received) {
				expect(Array.isArray(events)).toBe(true)
			}

			unsubscribe()
			const seen = received.length
			await client.endTurn()
			await match.drain()
			expect(received).toHaveLength(seen)
		} finally {
			match.destroy()
		}
	}, 15_000)
})
