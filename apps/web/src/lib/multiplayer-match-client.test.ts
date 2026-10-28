import { vi } from 'vite-plus/test'
import { type Intent } from '@hexwardens/game-logic/dispatch'
import { createOfflineMatch } from '@hexwardens/game-logic/match/offline'
import { humanVsBotConfig } from '@hexwardens/game-logic/match/test-helpers'
import {
	type BroadcastEvent,
	type ClientMessage
} from '@hexwardens/game-logic/multiplayer/types'
import {
	createMultiplayerMatchClient,
	type ServerGameStateUpdate
} from './multiplayer-match-client'
import { findIllegalMove, findLegalMove } from '@/test/match-intent-fixtures'
import { deriveBoardRenderData } from '@/components/game/board-render-data'
import { groupTerrainInstances } from '@/components/game/board-terrain-groups'

/**
 * Conformance tests for the multiplayer MatchClient adapter. The GameClient
 * transport is faked (a recording send/endTurn pair); the server-projected
 * `FilteredGameState` fed into `receiveGameState` is a real fog projection
 * produced by an offline match's `snapshotFor` — the same code path the
 * online server runs before a WebSocket push.
 */

async function makeServerUpdate(): Promise<
	ServerGameStateUpdate & { openingMove: Intent }
> {
	const match = createOfflineMatch({
		// Fixed seed: the intent fixtures probe for legal/illegal moves, and an
		// unseeded board (Date.now) occasionally generates an opening with none.
		config: { ...humanVsBotConfig(), seed: 42 },
		playerTribe: 'barbarians'
	})
	try {
		await match.ready()
		const snapshot = match.snapshotFor('barbarians')
		if (!snapshot) {
			throw new Error('expected a snapshot')
		}
		return {
			openingMove: findLegalMove(match.getState().gameState, 'barbarians'),
			state: snapshot.state,
			viewer: snapshot.viewer,
			currentTurn: snapshot.currentTurn
		}
	} finally {
		match.destroy()
	}
}

function makeTransport() {
	const sent: ClientMessage[] = []
	let endTurnCalls = 0
	return {
		sent,
		endTurnCalls: () => endTurnCalls,
		transport: {
			send: (msg: ClientMessage) => {
				sent.push(msg)
			},
			endTurn: () => {
				endTurnCalls++
			}
		}
	}
}

describe('createMultiplayerMatchClient', () => {
	it('preserves server fog, opponent records, and match outcome while simulating a move', async () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const update = await makeServerUpdate()
		client.receiveGameState(update)
		const initial = client.getGameState()
		if (!initial) {
			throw new Error('expected state')
		}
		expect(client.submitIntent(update.openingMove)).toEqual({
			accepted: true
		})
		const optimistic = client.getGameState()
		if (!optimistic) {
			throw new Error('expected optimistic state')
		}
		const fogEntries = update.state.units.board.flatMap((row, r) =>
			row.flatMap((tile, q) => (tile?.terrain === null ? [{ tile, r, q }] : []))
		)
		expect(fogEntries.length).toBeGreaterThan(0)
		for (const { tile, r, q } of fogEntries) {
			expect(optimistic.units.board[r]?.[q]).toBe(tile)
		}
		const opponents = Object.values(update.state.playerStates).filter(
			(player) => player.tribe !== update.viewer
		)
		for (const player of opponents) {
			expect(optimistic.playerStates[player.tribe]).toBe(player)
		}
		expect(optimistic.isGameOver).toBe(update.state.isGameOver)
		expect(optimistic.winner).toBe(update.state.winner)
		expect(optimistic.eliminatedTribes).toEqual(update.state.eliminatedTribes)
	})

	it('keeps unrevealed terrain renderable during optimistic movement', async () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const update = await makeServerUpdate()
		client.receiveGameState(update)
		const initial = client.getGameState()
		if (!initial) {
			throw new Error('expected state')
		}
		expect(client.submitIntent(update.openingMove).accepted).toBe(true)
		const optimistic = client.getGameState()
		if (!optimistic) {
			throw new Error('expected optimistic state')
		}
		const { entries } = deriveBoardRenderData({
			gameState: optimistic,
			currentPlayerTribe: 'barbarians',
			selectedTile: null
		})
		expect(entries.some((entry) => entry.kind === 'fog')).toBe(true)
		expect(() => groupTerrainInstances(entries)).not.toThrow()
		expect(
			entries
				.filter((entry) => entry.kind === 'tile')
				.map((entry) => entry.tile.terrain)
		).not.toContain(null)
	})

	it('has no state and refuses submissions before the first server projection', () => {
		const { transport, sent } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })

		expect(client.getGameState()).toBeNull()
		expect(client.canAct()).toBe(false)
		const submission = client.submitIntent({
			kind: 'move',
			from: { r_idx: 0, q_idx: 0 },
			to: { r_idx: 0, q_idx: 1 }
		})
		expect(submission).toEqual({
			accepted: false,
			reason: 'notAllowed',
			message: null
		})
		expect(sent).toHaveLength(0)
	})

	it('adopts the server projection and unlocks acting on the viewer turn', async () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const notify = vi.fn<() => void>()
		client.subscribe(notify)

		client.receiveGameState(await makeServerUpdate())

		expect(notify).toHaveBeenCalledTimes(1)
		expect(client.canAct()).toBe(true)
		const state = client.getGameState()
		if (!state) {
			throw new Error('expected state')
		}
		expect(state.currentPlayerTribe).toBe('barbarians')
		// Referentially stable snapshot between notifications.
		expect(client.getGameState()).toBe(state)
	})

	it('optimistically applies an accepted Intent, eager-sends it, and locks new submissions', async () => {
		const { transport, sent } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const update = await makeServerUpdate()
		client.receiveGameState(update)
		const serverState = client.getGameState()
		if (!serverState) {
			throw new Error('expected state')
		}
		const move = update.openingMove
		if (move.kind !== 'move') {
			throw new Error('expected a move intent')
		}

		const submission = client.submitIntent(move)

		expect(submission).toEqual({ accepted: true })
		expect(sent).toHaveLength(1)
		expect(sent[0]?.type).toBe('action')
		// The optimistic overlay is visible immediately…
		const optimistic = client.getGameState()
		if (!optimistic) {
			throw new Error('expected optimistic state')
		}
		expect(optimistic).not.toBe(serverState)
		expect(
			optimistic.units.board[move.to.r_idx]?.[move.to.q_idx]?.unit?.tribe
		).toBe('barbarians')
		// …and the single-flight lock holds until the server answers.
		expect(client.canAct()).toBe(false)
		const blocked = client.submitIntent(move)
		expect(blocked).toEqual({
			accepted: false,
			reason: 'notAllowed',
			message: null
		})
		expect(sent).toHaveLength(1)
	})

	it('clears the overlay when the next authoritative projection lands', async () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const update = await makeServerUpdate()
		client.receiveGameState(update)
		const initial = client.getGameState()
		if (!initial) {
			throw new Error('expected state')
		}
		client.submitIntent(update.openingMove)
		expect(client.canAct()).toBe(false)

		client.receiveGameState(update)

		// Server push is the acknowledgment: authoritative state wins and the
		// next click can fire.
		expect(client.canAct()).toBe(true)
		expect(client.getGameState()).not.toBe(initial)
	})

	it('rolls the overlay back on a server rejection', async () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const update = await makeServerUpdate()
		client.receiveGameState(update)
		const serverState = client.getGameState()
		if (!serverState) {
			throw new Error('expected state')
		}
		client.submitIntent(update.openingMove)
		expect(client.getGameState()).not.toBe(serverState)

		client.receiveActionResult({ success: false, message: 'rejected' })

		// Rollback: back to the last authoritative projection, lock released.
		expect(client.getGameState()).toBe(serverState)
		expect(client.canAct()).toBe(true)
	})

	it('keeps the overlay on a success acknowledgment until the projection arrives', async () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const update = await makeServerUpdate()
		client.receiveGameState(update)
		const serverState = client.getGameState()
		if (!serverState) {
			throw new Error('expected state')
		}
		client.submitIntent(update.openingMove)
		const optimistic = client.getGameState()

		client.receiveActionResult({ success: true, message: 'ok' })

		expect(client.getGameState()).toBe(optimistic)
		expect(client.canAct()).toBe(false)
	})

	it('rejects a locally-invalid Intent without a round-trip', async () => {
		const { transport, sent } = makeTransport()
		const onIntentRejected = vi.fn<() => void>()
		const client = createMultiplayerMatchClient({ transport, onIntentRejected })
		client.receiveGameState(await makeServerUpdate())
		const serverState = client.getGameState()
		if (!serverState) {
			throw new Error('expected state')
		}

		const submission = client.submitIntent(findIllegalMove(serverState))

		expect(submission.accepted).toBe(false)
		if (submission.accepted) {
			throw new Error('unreachable')
		}
		expect(submission.reason).toBe('invalid')
		expect(submission.message).toBeTruthy()
		expect(onIntentRejected).toHaveBeenCalledWith(submission.message)
		expect(sent).toHaveLength(0)
		// No overlay was created; the player can immediately try again.
		expect(client.getGameState()).toBe(serverState)
		expect(client.canAct()).toBe(true)
	})

	it('delegates endTurn to the transport', () => {
		const { transport, endTurnCalls } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		client.endTurn()
		expect(endTurnCalls()).toBe(1)
	})

	it('fans turnEvents out to broadcast subscribers until unsubscribed', () => {
		const { transport } = makeTransport()
		const client = createMultiplayerMatchClient({ transport })
		const received: (readonly BroadcastEvent[])[] = []
		const unsubscribe = client.subscribeBroadcastEvents((events) => {
			received.push(events)
		})

		const events: readonly BroadcastEvent[] = []
		client.receiveTurnEvents(events)
		expect(received).toHaveLength(1)
		expect(received[0]).toBe(events)

		unsubscribe()
		client.receiveTurnEvents(events)
		expect(received).toHaveLength(1)
	})
})
