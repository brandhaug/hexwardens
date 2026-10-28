import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	type LobbySlot,
	type LobbyState
} from '@hexwardens/game-logic/multiplayer/types'

/**
 * A render-ready seat at the table — either an actual lobby player/bot, or
 * an empty chair waiting to be filled / claimed by a bot.
 */
export type Seat =
	| {
			kind: 'player'
			seatIndex: number
			slot: LobbySlot
			isSelf: boolean
	  }
	| {
			kind: 'empty'
			seatIndex: number
	  }

export type LobbyPresentation = {
	/** Always exactly `config.maxPlayers` long. Player seats first, empties last. */
	seats: Seat[]
	localSeat: LobbySlot | null
	isHost: boolean
	allHumansReady: boolean
	canStart: boolean
	takenTribes: ReadonlySet<Tribe>
	readinessSummary: { ready: number; total: number }
}

/**
 * Pure projection from server-trusted lobby state to the data the UI binds.
 * Padding empty seats up to `maxPlayers` is purely cosmetic — the wire shape
 * never carries empties — so this stays client-side and the protocol is left
 * untouched (issue #162: "preserve existing lobby protocol semantics").
 */
export function presentLobby(
	state: LobbyState,
	localPlayerId: string | null
): LobbyPresentation {
	const playerSeats: Seat[] = state.slots.map((slot, index) => ({
		kind: 'player' as const,
		seatIndex: index,
		slot,
		isSelf: slot.playerId === localPlayerId
	}))

	const emptySeats: Seat[] = []
	for (let i = state.slots.length; i < state.config.maxPlayers; i++) {
		emptySeats.push({ kind: 'empty', seatIndex: i })
	}

	const seats = [...playerSeats, ...emptySeats]

	const localSeat =
		state.slots.find((s) => s.playerId === localPlayerId) ?? null

	const humans = state.slots.filter((s) => !s.isBot)
	const readyHumans = humans.filter((s) => s.isReady && s.tribe !== null)
	const allHumansReady = humans.length > 0 && humans.every((s) => s.isReady)

	const isHost = localSeat?.isHost ?? false

	const takenTribes = new Set<Tribe>()
	for (const s of state.slots) {
		if (s.tribe !== null) {
			takenTribes.add(s.tribe)
		}
	}

	return {
		seats,
		localSeat,
		isHost,
		allHumansReady,
		canStart: isHost && allHumansReady,
		takenTribes,
		readinessSummary: { ready: readyHumans.length, total: humans.length }
	}
}
