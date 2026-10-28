const timerConfig = (turnTimerSeconds: number | null) =>
	JSON.stringify({ mapSize: 'medium', maxPlayers: 4, turnTimerSeconds })
const playerConfig = (maxPlayers: number) =>
	JSON.stringify({ mapSize: 'medium', maxPlayers, turnTimerSeconds: 90 })
import { assert } from 'vite-plus/test'
import { drizzle } from 'drizzle-orm/node-sqlite'
import {
	LobbyStore,
	computeLobbyReadiness,
	lobbyTtlSeconds,
	maxLobbiesPerHost,
	parseLobbyConfig,
	startIdempotencyKey
} from './lobby-store'

function createStore(): LobbyStore {
	const store = new LobbyStore(drizzle(':memory:'))
	store.migrate()
	return store
}

async function createLobby(store: LobbyStore, player = host) {
	const outcome = await store.createPrivateLobby(player)
	if (outcome.status !== 'created') {
		throw new Error('expected lobby to be created')
	}
	return outcome
}

const host = { playerId: 'p-host', username: 'Host' }
const guest = { playerId: 'p-guest', username: 'Guest' }
const third = { playerId: 'p-third', username: 'Third' }

describe('startIdempotencyKey', () => {
	it('combines lobby id and createdAt', () => {
		expect(startIdempotencyKey('lobby-1', 1_700_000_000)).toBe(
			'lobby-1:1700000000'
		)
	})

	it('is stable for the same lobby instance', () => {
		expect(startIdempotencyKey('lobby-1', 42)).toBe(
			startIdempotencyKey('lobby-1', 42)
		)
	})

	it('changes when the same lobby id is recreated at a different time', () => {
		expect(startIdempotencyKey('lobby-1', 42)).not.toBe(
			startIdempotencyKey('lobby-1', 43)
		)
	})
})

describe('computeLobbyReadiness', () => {
	const privateLobby = { kind: 'private', hostPlayerId: 'p-host' } as const

	it('blocks when the lobby does not exist', () => {
		const readiness = computeLobbyReadiness({
			lobby: null,
			configValid: true,
			unreadyPlayerIds: []
		})
		expect(readiness.canStart).toBe(false)
		expect(readiness.blockingReasons).toEqual([{ kind: 'lobby-not-found' }])
	})

	it('blocks a non-host start of a private lobby', () => {
		const readiness = computeLobbyReadiness({
			lobby: privateLobby,
			configValid: true,
			unreadyPlayerIds: [],
			requestedBy: 'p-guest'
		})
		expect(readiness.canStart).toBe(false)
		expect(readiness.blockingReasons).toEqual([{ kind: 'not-host' }])
	})

	it('skips the host rule for public queue lobbies', () => {
		const readiness = computeLobbyReadiness({
			lobby: { kind: 'publicQueue', hostPlayerId: 'p-host' },
			configValid: true,
			unreadyPlayerIds: [],
			requestedBy: 'p-guest'
		})
		expect(readiness.canStart).toBe(true)
	})

	it('skips the host rule when no requester is supplied (system start)', () => {
		const readiness = computeLobbyReadiness({
			lobby: privateLobby,
			configValid: true,
			unreadyPlayerIds: []
		})
		expect(readiness.canStart).toBe(true)
		expect(readiness.blockingReasons).toEqual([])
	})

	it('blocks when human players are unready or tribeless', () => {
		const readiness = computeLobbyReadiness({
			lobby: privateLobby,
			configValid: true,
			unreadyPlayerIds: ['p-guest'],
			requestedBy: 'p-host'
		})
		expect(readiness.canStart).toBe(false)
		expect(readiness.blockingReasons).toEqual([
			{ kind: 'players-not-ready', playerIds: ['p-guest'] }
		])
	})

	it('blocks on an unparseable config', () => {
		const readiness = computeLobbyReadiness({
			lobby: privateLobby,
			configValid: false,
			unreadyPlayerIds: [],
			requestedBy: 'p-host'
		})
		expect(readiness.blockingReasons).toEqual([{ kind: 'invalid-config' }])
	})

	it('orders the host rule before readiness and config', () => {
		const readiness = computeLobbyReadiness({
			lobby: privateLobby,
			configValid: false,
			unreadyPlayerIds: ['p-guest'],
			requestedBy: 'p-guest'
		})
		expect(readiness.blockingReasons.map((r) => r.kind)).toEqual([
			'not-host',
			'players-not-ready',
			'invalid-config'
		])
	})
})

describe('parseLobbyConfig', () => {
	it('parses a valid config', () => {
		expect(
			parseLobbyConfig(
				JSON.stringify({
					mapSize: 'medium',
					maxPlayers: 4,
					turnTimerSeconds: 90
				})
			)
		).toEqual({ mapSize: 'medium', maxPlayers: 4, turnTimerSeconds: 90 })
	})

	it('accepts a null turn timer and rejects malformed input', () => {
		expect(
			parseLobbyConfig(
				JSON.stringify({
					mapSize: 'small',
					maxPlayers: 2,
					turnTimerSeconds: null
				})
			)
		).toEqual({ mapSize: 'small', maxPlayers: 2, turnTimerSeconds: null })
		expect(parseLobbyConfig('not json')).toBeNull()
		expect(parseLobbyConfig(JSON.stringify({ mapSize: 'huge' }))).toBeNull()
	})

	it('rejects out-of-bounds player counts', () => {
		expect(parseLobbyConfig(playerConfig(1))).toBeNull()
		expect(parseLobbyConfig(playerConfig(10))).toBeNull()
		expect(parseLobbyConfig(playerConfig(1_000_000))).toBeNull()
		expect(parseLobbyConfig(playerConfig(2.5))).toBeNull()
		expect(parseLobbyConfig(playerConfig(2))).not.toBeNull()
		expect(parseLobbyConfig(playerConfig(4))).not.toBeNull()
		expect(parseLobbyConfig(playerConfig(5))).toBeNull()
		expect(parseLobbyConfig(playerConfig(9))).toBeNull()
	})

	it('rejects out-of-bounds turn timers', () => {
		expect(parseLobbyConfig(timerConfig(5))).toBeNull()
		expect(parseLobbyConfig(timerConfig(999_999_999))).toBeNull()
		expect(parseLobbyConfig(timerConfig(90.5))).toBeNull()
		expect(parseLobbyConfig(timerConfig(60))).not.toBeNull()
		expect(parseLobbyConfig(timerConfig(120))).not.toBeNull()
		expect(parseLobbyConfig(timerConfig(null))).not.toBeNull()
	})
})

describe('LobbyStore private lobbies', () => {
	it('creates a lobby with the host seated in slot 0', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)

		expect(inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)

		const state = await store.getLobbyState(lobbyId)
		expect(state).not.toBeNull()
		expect(state?.kind).toBe('private')
		expect(state?.config).toEqual({
			mapSize: 'medium',
			maxPlayers: 4,
			turnTimerSeconds: 90
		})
		expect(state?.slots).toEqual([
			{
				playerId: host.playerId,
				username: host.username,
				tribe: null,
				isBot: false,
				botDifficulty: 'Beginner',
				isReady: false,
				isHost: true
			}
		])
	})

	it('joins by invite code and is idempotent', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)

		expect(await store.joinByInviteCode('ZZZZZZ', guest)).toEqual({
			status: 'not-found'
		})
		expect(await store.joinByInviteCode(inviteCode, guest)).toEqual({
			status: 'joined',
			lobbyId
		})
		expect(await store.joinByInviteCode(inviteCode, guest)).toEqual({
			status: 'already-joined',
			lobbyId
		})
		expect(await store.isMember(lobbyId, guest.playerId)).toBe(true)
		expect(await store.isMember(lobbyId, 'p-stranger')).toBe(false)
	})

	it('rejects joins beyond the human capacity', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		expect(
			await store.configure(lobbyId, host.playerId, { maxPlayers: 2 })
		).toBe('ok')
		expect(await store.joinByInviteCode(inviteCode, guest)).toEqual({
			status: 'joined',
			lobbyId
		})
		expect(await store.joinByInviteCode(inviteCode, third)).toEqual({
			status: 'full'
		})
	})

	it('only lets the host configure the lobby', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)

		expect(
			await store.configure(lobbyId, guest.playerId, { mapSize: 'large' })
		).toBe('not-host')
		expect(
			await store.configure(lobbyId, host.playerId, { mapSize: 'large' })
		).toBe('ok')

		const state = await store.getLobbyState(lobbyId)
		expect(state?.config.mapSize).toBe('large')
		expect(state?.config.maxPlayers).toBe(4)
	})
})

describe('LobbyStore tribe and readiness', () => {
	it('requires a tribe before readying up', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)

		expect(await store.setReady(lobbyId, host.playerId, true)).toBe(
			'tribe-required'
		)
		expect(await store.setTribe(lobbyId, host.playerId, 'barbarians')).toBe(
			'ok'
		)
		expect(await store.setReady(lobbyId, host.playerId, true)).toBe('ok')

		const state = await store.getLobbyState(lobbyId)
		expect(state?.slots[0]?.isReady).toBe(true)
	})

	it('rejects a tribe already taken by another player', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)

		expect(await store.setTribe(lobbyId, host.playerId, 'barbarians')).toBe(
			'ok'
		)
		expect(await store.setTribe(lobbyId, guest.playerId, 'barbarians')).toBe(
			'tribe-taken'
		)
		// Re-picking your own tribe is allowed.
		expect(await store.setTribe(lobbyId, host.playerId, 'barbarians')).toBe(
			'ok'
		)
	})

	it('resets readiness when the tribe changes', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)

		await store.setTribe(lobbyId, host.playerId, 'barbarians')
		await store.setReady(lobbyId, host.playerId, true)
		await store.setTribe(lobbyId, host.playerId, 'rogues')

		const state = await store.getLobbyState(lobbyId)
		expect(state?.slots[0]?.tribe).toBe('rogues')
		expect(state?.slots[0]?.isReady).toBe(false)
	})
})

describe('LobbyStore bot slots', () => {
	it('only lets the host manage bots', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)

		expect(
			await store.setSlotBot(lobbyId, guest.playerId, 2, true, 'Beginner')
		).toBe('not-host')
	})

	it('adds and removes a ready bot with an auto-assigned tribe', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)
		await store.setTribe(lobbyId, host.playerId, 'barbarians')

		expect(
			await store.setSlotBot(lobbyId, host.playerId, 1, true, 'Advanced')
		).toBe('ok')

		const state = await store.getLobbyState(lobbyId)
		const bot = state?.slots.find((s) => s.isBot)
		expect(bot).toBeDefined()
		expect(bot?.playerId).toBe('bot_1')
		expect(bot?.isReady).toBe(true)
		expect(bot?.botDifficulty).toBe('Advanced')
		expect(bot?.tribe).not.toBeNull()
		expect(bot?.tribe).not.toBe('barbarians')

		expect(await store.setSlotBot(lobbyId, host.playerId, 1, false)).toBe('ok')
		const after = await store.getLobbyState(lobbyId)
		expect(after?.slots.some((s) => s.isBot)).toBe(false)
	})

	it('rejects bots in public queue lobbies', async () => {
		const store = createStore()
		const entry = await store.joinPublicQueue(host)

		expect(
			await store.setSlotBot(entry.lobbyId, host.playerId, 1, true, 'Beginner')
		).toBe('public-queue')
	})
})

describe('LobbyStore kind-aware player listing', () => {
	it('lists bots for private lobbies but never for public queue', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)
		await store.setSlotBot(lobbyId, host.playerId, 1, true, 'Beginner')

		const asPrivate = await store.listPlayers(lobbyId, 'private')
		expect(asPrivate.map((p) => p.playerId)).toEqual([host.playerId, 'bot_1'])

		const asPublicQueue = await store.listPlayers(lobbyId, 'publicQueue')
		expect(asPublicQueue.map((p) => p.playerId)).toEqual([host.playerId])
	})
})

describe('LobbyStore leave handling', () => {
	it('deletes the lobby when the last human leaves', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)
		// A bot must not keep the lobby alive.
		await store.setSlotBot(lobbyId, host.playerId, 1, true, 'Beginner')

		expect(await store.removePlayer(lobbyId, host.playerId)).toBe(
			'lobby-deleted'
		)
		expect(await store.getLobbyState(lobbyId)).toBeNull()
	})

	it('transfers host when the host leaves and humans remain', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)

		expect(await store.removePlayer(lobbyId, host.playerId)).toBe(
			'players-remain'
		)

		const state = await store.getLobbyState(lobbyId)
		expect(state?.slots).toHaveLength(1)
		expect(state?.slots[0]?.playerId).toBe(guest.playerId)
		expect(state?.slots[0]?.isHost).toBe(true)
	})
})

describe('LobbyStore start context', () => {
	it('blocks when the lobby does not exist', async () => {
		const store = createStore()
		const context = await store.readStartContext('nope')
		expect(context.status).toBe('blocked')
		assert(context.status === 'blocked')
		expect(context.readiness.blockingReasons).toEqual([
			{ kind: 'lobby-not-found' }
		])
	})

	it('blocks a non-host requester', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)

		const context = await store.readStartContext(lobbyId, guest.playerId)
		expect(context.status).toBe('blocked')
		assert(context.status === 'blocked')
		expect(context.readiness.blockingReasons[0]).toEqual({
			kind: 'not-host'
		})
	})

	it('blocks while human players are unready or tribeless', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)
		await store.setTribe(lobbyId, host.playerId, 'barbarians')
		await store.setReady(lobbyId, host.playerId, true)

		const context = await store.readStartContext(lobbyId, host.playerId)
		expect(context.status).toBe('blocked')
		assert(context.status === 'blocked')
		expect(context.readiness.blockingReasons).toEqual([
			{ kind: 'players-not-ready', playerIds: [guest.playerId] }
		])
	})

	it('returns a snapshot and idempotency key when everyone is ready', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.joinByInviteCode(inviteCode, guest)
		await store.setTribe(lobbyId, host.playerId, 'barbarians')
		await store.setReady(lobbyId, host.playerId, true)
		await store.setTribe(lobbyId, guest.playerId, 'rogues')
		await store.setReady(lobbyId, guest.playerId, true)

		const context = await store.readStartContext(lobbyId, host.playerId)
		expect(context.status).toBe('ready')
		assert(context.status === 'ready')
		expect(context.snapshot.lobbyId).toBe(lobbyId)
		expect(context.snapshot.kind).toBe('private')
		expect(context.snapshot.slots.map((s) => s.playerId)).toEqual([
			host.playerId,
			guest.playerId
		])
		expect(context.idempotencyKey).toMatch(new RegExp(`^${lobbyId}:\\d+$`))
	})

	it('includes private-lobby bots in the start snapshot', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)
		await store.setTribe(lobbyId, host.playerId, 'barbarians')
		await store.setReady(lobbyId, host.playerId, true)
		await store.setSlotBot(lobbyId, host.playerId, 1, true, 'Advanced')

		const context = await store.readStartContext(lobbyId, host.playerId)
		expect(context.status).toBe('ready')
		assert(context.status === 'ready')
		expect(context.snapshot.slots).toHaveLength(2)
		expect(context.snapshot.slots[1]?.isBot).toBe(true)
	})

	it('keeps the idempotency key stable across repeated reads', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)
		await store.setTribe(lobbyId, host.playerId, 'barbarians')
		await store.setReady(lobbyId, host.playerId, true)

		const first = await store.readStartContext(lobbyId, host.playerId)
		const second = await store.readStartContext(lobbyId, host.playerId)
		expect(first.status).toBe('ready')
		expect(second.status).toBe('ready')
		assert(first.status === 'ready' && second.status === 'ready')
		expect(first.idempotencyKey).toBe(second.idempotencyKey)
	})
})

describe('LobbyStore public queue', () => {
	it('creates a queue lobby for the first player and fills it for the second', async () => {
		const store = createStore()

		const first = await store.joinPublicQueue(host)
		expect(first.entered).toBe('created')
		expect(first.playerCount).toBe(1)
		expect(first.config.maxPlayers).toBe(2)

		const second = await store.joinPublicQueue(guest)
		expect(second.entered).toBe('existing')
		expect(second.lobbyId).toBe(first.lobbyId)
		expect(second.playerCount).toBe(2)
	})

	it('is idempotent for an already-queued player', async () => {
		const store = createStore()
		const first = await store.joinPublicQueue(host)
		const again = await store.joinPublicQueue(host)

		expect(again.entered).toBe('existing')
		expect(again.lobbyId).toBe(first.lobbyId)
		expect(again.playerCount).toBe(1)
	})

	it('overflows into a fresh lobby when the queue is full', async () => {
		const store = createStore()
		const first = await store.joinPublicQueue(host)
		await store.joinPublicQueue(guest)

		const overflow = await store.joinPublicQueue(third)
		expect(overflow.entered).toBe('created')
		expect(overflow.lobbyId).not.toBe(first.lobbyId)
		expect(overflow.playerCount).toBe(1)
	})

	it('seats players ready with distinct auto-assigned tribes', async () => {
		const store = createStore()
		const entry = await store.joinPublicQueue(host)
		await store.joinPublicQueue(guest)

		const state = await store.getLobbyState(entry.lobbyId)
		expect(state?.kind).toBe('publicQueue')
		const seats = state?.slots ?? []
		expect(seats).toHaveLength(2)
		expect(seats.every((s) => s.isReady)).toBe(true)
		expect(seats[0]?.tribe).not.toBeNull()
		expect(seats[1]?.tribe).not.toBeNull()
		expect(seats[0]?.tribe).not.toBe(seats[1]?.tribe)
	})

	it('a full public queue is start-ready without a requester', async () => {
		const store = createStore()
		const entry = await store.joinPublicQueue(host)
		await store.joinPublicQueue(guest)

		const context = await store.readStartContext(entry.lobbyId)
		expect(context.status).toBe('ready')
		assert(context.status === 'ready')
		expect(context.snapshot.kind).toBe('publicQueue')
		expect(context.snapshot.slots).toHaveLength(2)
	})
})

describe('LobbyStore abuse limits', () => {
	it('rejects host-supplied config outside the bounds', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)

		expect(
			await store.configure(lobbyId, host.playerId, { maxPlayers: 1_000_000 })
		).toBe('invalid-config')
		expect(
			await store.configure(lobbyId, host.playerId, {
				turnTimerSeconds: 999_999_999
			})
		).toBe('invalid-config')
		expect(
			await store.configure(lobbyId, host.playerId, { turnTimerSeconds: 0 })
		).toBe('invalid-config')

		const state = await store.getLobbyState(lobbyId)
		expect(state?.config).toEqual({
			mapSize: 'medium',
			maxPlayers: 4,
			turnTimerSeconds: 90
		})
	})

	it('caps the number of lobbies a player can host', async () => {
		const store = createStore()
		for (let i = 0; i < maxLobbiesPerHost; i++) {
			await createLobby(store)
		}

		expect(await store.createPrivateLobby(host)).toEqual({
			status: 'limit-reached'
		})
		// Other players are unaffected by the host's cap.
		const guestLobby = await store.createPrivateLobby(guest)
		expect(guestLobby.status).toBe('created')
	})

	it('frees the cap when a hosted lobby is deleted', async () => {
		const store = createStore()
		const first = await createLobby(store)
		for (let i = 1; i < maxLobbiesPerHost; i++) {
			await createLobby(store)
		}
		expect(await store.createPrivateLobby(host)).toEqual({
			status: 'limit-reached'
		})

		await store.deleteLobby(first.lobbyId)
		const replacement = await store.createPrivateLobby(host)
		expect(replacement.status).toBe('created')
	})

	it('sweeps lobbies past the TTL and keeps fresh ones', async () => {
		const store = createStore()
		const stale = await createLobby(store)

		const beforeExpiry = Math.floor(Date.now() / 1000) + lobbyTtlSeconds - 60
		expect(await store.deleteExpiredLobbies(beforeExpiry)).toBe(0)
		expect(await store.getLobbyState(stale.lobbyId)).not.toBeNull()

		const afterExpiry = Math.floor(Date.now() / 1000) + lobbyTtlSeconds + 60
		expect(await store.deleteExpiredLobbies(afterExpiry)).toBe(1)
		expect(await store.getLobbyState(stale.lobbyId)).toBeNull()
		expect(await store.isMember(stale.lobbyId, host.playerId)).toBe(false)
	})
})

describe('fixed map capacity', () => {
	it('rejects overcrowded config and shrinking below occupied seats', async () => {
		const store = createStore()
		const { lobbyId } = await createLobby(store)
		expect(
			await store.configure(lobbyId, host.playerId, { mapSize: 'small' })
		).toBe('invalid-config')
		expect(
			await store.configure(lobbyId, host.playerId, {
				mapSize: 'small',
				maxPlayers: 3
			})
		).toBe('ok')
		expect(await store.setSlotBot(lobbyId, host.playerId, 3, true)).toBe(
			'invalid-config'
		)
		expect(await store.setSlotBot(lobbyId, host.playerId, 2, true)).toBe('ok')
		expect(
			await store.configure(lobbyId, host.playerId, { maxPlayers: 2 })
		).toBe('invalid-config')
	})

	it('counts bots when admitting humans', async () => {
		const store = createStore()
		const { lobbyId, inviteCode } = await createLobby(store)
		await store.configure(lobbyId, host.playerId, { maxPlayers: 2 })
		await store.setSlotBot(lobbyId, host.playerId, 1, true)
		expect(await store.joinByInviteCode(inviteCode, guest)).toEqual({
			status: 'full'
		})
	})
})
