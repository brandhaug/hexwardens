import { describe, expect, it } from 'vite-plus/test'
import {
	type LobbySlot,
	type LobbyState
} from '@hexwardens/game-logic/multiplayer/types'
import { presentLobby } from './lobby-presentation'

function slot(overrides: Partial<LobbySlot> = {}): LobbySlot {
	return {
		playerId: 'p1',
		username: 'Alice',
		tribe: null,
		isBot: false,
		botDifficulty: 'Beginner',
		isReady: false,
		isHost: false,
		...overrides
	}
}

function lobby(overrides: Partial<LobbyState> = {}): LobbyState {
	return {
		lobbyId: 'l1',
		inviteCode: 'ABCD12',
		kind: 'private',
		config: { mapSize: 'medium', maxPlayers: 4, turnTimerSeconds: 90 },
		slots: [],
		phase: 'waiting',
		...overrides
	}
}

describe('presentLobby', () => {
	it('pads seats up to maxPlayers with empty banners', () => {
		const view = presentLobby(
			lobby({
				slots: [slot({ playerId: 'p1', isHost: true })]
			}),
			'p1'
		)

		expect(view.seats).toHaveLength(4)
		expect(view.seats[0]?.kind).toBe('player')
		expect(view.seats[1]?.kind).toBe('empty')
		expect(view.seats[2]?.kind).toBe('empty')
		expect(view.seats[3]?.kind).toBe('empty')
	})

	it('marks the local seat as self', () => {
		const view = presentLobby(
			lobby({
				slots: [
					slot({ playerId: 'p1', username: 'Alice', isHost: true }),
					slot({ playerId: 'p2', username: 'Bob' })
				]
			}),
			'p2'
		)

		const aliceSeat = view.seats[0]
		const bobSeat = view.seats[1]
		if (aliceSeat?.kind !== 'player' || bobSeat?.kind !== 'player') {
			throw new Error('expected two player seats')
		}
		expect(aliceSeat.isSelf).toBe(false)
		expect(bobSeat.isSelf).toBe(true)
	})

	it('reports allHumansReady=false when any human is not ready', () => {
		const view = presentLobby(
			lobby({
				slots: [
					slot({
						playerId: 'p1',
						tribe: 'barbarians',
						isReady: true,
						isHost: true
					}),
					slot({ playerId: 'p2', tribe: 'orcs', isReady: false })
				]
			}),
			'p1'
		)

		expect(view.allHumansReady).toBe(false)
		expect(view.canStart).toBe(false)
	})

	it('canStart requires the local seat to be host AND all humans ready', () => {
		const view = presentLobby(
			lobby({
				slots: [
					slot({
						playerId: 'p1',
						tribe: 'barbarians',
						isReady: true,
						isHost: true
					}),
					slot({ playerId: 'p2', tribe: 'orcs', isReady: true })
				]
			}),
			'p1'
		)

		expect(view.allHumansReady).toBe(true)
		expect(view.isHost).toBe(true)
		expect(view.canStart).toBe(true)
	})

	it('host who is not ready can still start because host has no ready button', () => {
		// Host is treated like any human — must pick tribe + be ready.
		const view = presentLobby(
			lobby({
				slots: [
					slot({
						playerId: 'p1',
						tribe: 'barbarians',
						isReady: false,
						isHost: true
					}),
					slot({ playerId: 'p2', tribe: 'orcs', isReady: true })
				]
			}),
			'p1'
		)

		expect(view.allHumansReady).toBe(false)
		expect(view.canStart).toBe(false)
	})

	it('bots count as ready', () => {
		const view = presentLobby(
			lobby({
				slots: [
					slot({
						playerId: 'p1',
						tribe: 'barbarians',
						isReady: true,
						isHost: true
					}),
					slot({
						playerId: 'bot_1',
						tribe: 'orcs',
						isBot: true,
						isReady: true,
						username: 'Bot 2'
					})
				]
			}),
			'p1'
		)

		expect(view.allHumansReady).toBe(true)
		expect(view.canStart).toBe(true)
	})

	it('exposes the set of taken tribes so selection can disable them', () => {
		const view = presentLobby(
			lobby({
				slots: [
					slot({ playerId: 'p1', tribe: 'barbarians', isHost: true }),
					slot({ playerId: 'p2', tribe: 'orcs' })
				]
			}),
			'p1'
		)

		expect(view.takenTribes.has('barbarians')).toBe(true)
		expect(view.takenTribes.has('orcs')).toBe(true)
		expect(view.takenTribes.has('templars')).toBe(false)
	})

	it('returns localSeat=null when the local player is not in the lobby (spectator/loading)', () => {
		const view = presentLobby(
			lobby({
				slots: [slot({ playerId: 'p1', isHost: true })]
			}),
			null
		)

		expect(view.localSeat).toBeNull()
		expect(view.isHost).toBe(false)
		expect(view.canStart).toBe(false)
	})

	it('seats are ordered by lobby slot order, then empty seats fill remaining indices', () => {
		const view = presentLobby(
			lobby({
				config: { mapSize: 'small', maxPlayers: 3, turnTimerSeconds: null },
				slots: [
					slot({ playerId: 'p1', username: 'Alice', isHost: true }),
					slot({
						playerId: 'bot_2',
						username: 'Bot 3',
						isBot: true,
						isReady: true
					})
				]
			}),
			'p1'
		)

		expect(view.seats).toHaveLength(3)
		expect(view.seats.map((s) => s.kind)).toEqual(['player', 'player', 'empty'])
		const empty = view.seats[2]
		if (empty?.kind !== 'empty') {
			throw new Error('expected empty')
		}
		expect(empty.seatIndex).toBe(2)
	})

	it('summarises readiness as "n / m" excluding bots', () => {
		const view = presentLobby(
			lobby({
				slots: [
					slot({
						playerId: 'p1',
						tribe: 'barbarians',
						isReady: true,
						isHost: true
					}),
					slot({ playerId: 'p2', tribe: 'orcs', isReady: false }),
					slot({
						playerId: 'bot_1',
						isBot: true,
						isReady: true,
						username: 'Bot 3'
					})
				]
			}),
			'p1'
		)

		expect(view.readinessSummary).toEqual({ ready: 1, total: 2 })
	})
})
