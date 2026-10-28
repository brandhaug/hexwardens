import { canFitPlayers } from '@hexwardens/game-logic/board/map-capacity'
import { and, eq, lt, ne, notExists, sql } from 'drizzle-orm'
import { alias, type SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core'
import { Result, Schema } from 'effect'
import {
	isDifficulty,
	type Difficulty
} from '@hexwardens/game-logic/difficulty'
import { mapSizes } from '@hexwardens/game-logic/multiplayer/types'
import {
	isTribe,
	tribes,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import {
	parseLobbySnapshot,
	type LobbySnapshot
} from '@hexwardens/game-logic/match/initializer'
import { lobbies, lobbyPlayers } from './matchmaker-schema'
import { type LobbyConfig, type LobbySlot, type LobbyState } from './types'

/**
 * Any synchronous Drizzle SQLite handle. In production this is the
 * `durable-sqlite` driver over Durable Object SQL storage; tests use the
 * `node-sqlite` driver over an in-memory database.
 */
export type LobbyDb = SQLiteAsyncDatabase<'sync', unknown>

export type LobbyKind = 'private' | 'publicQueue'

export type LobbyPlayerRow = {
	playerId: string
	username: string
	tribe: Tribe | null
	isBot: boolean
	botDifficulty: Difficulty
	isReady: boolean
	isHost: boolean
	slotIndex: number
}

export type CreateLobbyOutcome =
	| { status: 'created'; lobbyId: string; inviteCode: string }
	| { status: 'limit-reached' }

export type JoinByInviteOutcome =
	| { status: 'joined'; lobbyId: string }
	| { status: 'already-joined'; lobbyId: string }
	| { status: 'not-found' }
	| { status: 'invalid-config' }
	| { status: 'full' }

export type PublicQueueEntry = {
	lobbyId: string
	config: LobbyConfig
	playerCount: number
	entered: 'existing' | 'created'
}

export type LobbyBlockingReason =
	| { kind: 'lobby-not-found' }
	| { kind: 'not-host' }
	| { kind: 'players-not-ready'; playerIds: readonly string[] }
	| { kind: 'invalid-config' }
	| { kind: 'invalid-state'; issues: readonly string[] }

export type LobbyReadiness = {
	canStart: boolean
	blockingReasons: readonly LobbyBlockingReason[]
}

export type StartContext =
	| { status: 'ready'; snapshot: LobbySnapshot; idempotencyKey: string }
	| { status: 'blocked'; readiness: LobbyReadiness }

/**
 * Hard bounds on host-supplied lobby config. The wire codec only checks
 * types, so anything inside `LobbyConfig`'s structural shape reaches the
 * store — these bounds are what stops a host from configuring a
 * million-player lobby or a multi-week turn timer.
 */
export const lobbyConfigBounds = {
	minPlayers: 2,
	maxPlayers: tribes.length,
	minTurnTimerSeconds: 30,
	maxTurnTimerSeconds: 600
} as const

/** Active private lobbies a single player may host at once. */
export const maxLobbiesPerHost = 3

/** Lobbies idle past this age are swept on the next create/queue request. */
export const lobbyTtlSeconds = 24 * 60 * 60

const privateLobbyConfig: LobbyConfig = {
	mapSize: 'medium',
	maxPlayers: 4,
	turnTimerSeconds: 90
}

const publicQueueConfig: LobbyConfig = {
	mapSize: 'medium',
	maxPlayers: 2,
	turnTimerSeconds: 90
}

/**
 * Start idempotency key for one lobby *instance*.
 *
 * Invariant: `createdAt` pins the key to this lobby instance. The Match DO
 * uses the key as the match id, so every start retry from the same lobby
 * collapses onto the same Match DO, while a lobby id that is deleted and
 * later recreated gets a fresh key (and therefore a fresh match).
 */
export function startIdempotencyKey(
	lobbyId: string,
	createdAt: number
): string {
	return `${lobbyId}:${createdAt}`
}

/**
 * First-class Lobby readiness. Encodes the start rules:
 *
 * - the lobby must exist (`lobby-not-found`),
 * - only the host may start a private lobby — Public Queue starts are
 *   system-driven, so the host rule is skipped for `publicQueue` kind and
 *   when no `requestedBy` is supplied (`not-host`),
 * - every human player must be ready AND have picked a tribe — the SQL
 *   predicate `(is_ready = 0 OR tribe IS NULL)` flags blockers
 *   (`players-not-ready`),
 * - the stored config must parse (`invalid-config`).
 *
 * The minimum-player rule (at least one slot) is enforced downstream by
 * `parseLobbySnapshot`, surfacing as an `invalid-state` reason in
 * `readStartContext`.
 */
export function computeLobbyReadiness(input: {
	lobby: { kind: LobbyKind; hostPlayerId: string } | null
	configValid: boolean
	unreadyPlayerIds: readonly string[]
	requestedBy?: string | undefined
}): LobbyReadiness {
	if (input.lobby === null) {
		return { canStart: false, blockingReasons: [{ kind: 'lobby-not-found' }] }
	}

	const blockingReasons: LobbyBlockingReason[] = []
	if (
		input.requestedBy !== undefined &&
		input.lobby.kind !== 'publicQueue' &&
		input.lobby.hostPlayerId !== input.requestedBy
	) {
		blockingReasons.push({ kind: 'not-host' })
	}
	if (input.unreadyPlayerIds.length > 0) {
		blockingReasons.push({
			kind: 'players-not-ready',
			playerIds: input.unreadyPlayerIds
		})
	}
	if (!input.configValid) {
		blockingReasons.push({ kind: 'invalid-config' })
	}
	return { canStart: blockingReasons.length === 0, blockingReasons }
}

/**
 * Schema encoding of {@link lobbyConfigBounds}. The single source of truth
 * for what a structurally-and-numerically valid `LobbyConfig` is — both the
 * stored-JSON read path ({@link parseLobbyConfig}) and the configure-merge
 * write path ({@link isValidLobbyConfig}) decode against it.
 */
const lobbyConfigSchema = Schema.Struct({
	mapSize: Schema.Literals(mapSizes),
	maxPlayers: Schema.Number.pipe(
		Schema.check(
			Schema.isInt(),
			Schema.isBetween({
				minimum: lobbyConfigBounds.minPlayers,
				maximum: lobbyConfigBounds.maxPlayers
			})
		)
	),
	turnTimerSeconds: Schema.NullOr(
		Schema.Number.pipe(
			Schema.check(
				Schema.isInt(),
				Schema.isBetween({
					minimum: lobbyConfigBounds.minTurnTimerSeconds,
					maximum: lobbyConfigBounds.maxTurnTimerSeconds
				})
			)
		)
	)
})

const decodeLobbyConfig = Schema.decodeUnknownResult(lobbyConfigSchema)
const decodeLobbyConfigJson = Schema.decodeUnknownResult(
	Schema.fromJsonString(lobbyConfigSchema)
)

export function isValidLobbyConfig(config: LobbyConfig): boolean {
	return (
		Result.isSuccess(decodeLobbyConfig(config)) &&
		canFitPlayers(config.mapSize, config.maxPlayers)
	)
}

export function parseLobbyConfig(input: string): LobbyConfig | null {
	const decoded = decodeLobbyConfigJson(input)
	return Result.isSuccess(decoded) && isValidLobbyConfig(decoded.success)
		? decoded.success
		: null
}

function isLobbyKind(value: string): value is LobbyKind {
	return value === 'private' || value === 'publicQueue'
}

export function generateInviteCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
	const maxUnbiased = 256 - (256 % chars.length) // reject values >= this
	let code = ''
	while (code.length < 6) {
		const bytes = new Uint8Array(1)
		crypto.getRandomValues(bytes)
		const byte = new DataView(bytes.buffer).getUint8(0)
		if (byte < maxUnbiased) {
			code += chars.charAt(byte % chars.length)
		}
	}
	return code
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000)
}

/**
 * Owns all Lobby state in the Matchmaker Durable Object's SQL storage —
 * schema creation, membership, readiness, bot slots, configuration, and the
 * start-lobby read path. The DO handlers parse/validate requests, call one
 * store method, and broadcast; no Drizzle chains live outside this module.
 */
export class LobbyStore {
	private readonly db: LobbyDb

	constructor(db: LobbyDb) {
		this.db = db
	}

	/** Idempotent schema creation — runs on every DO construction. */
	migrate(): void {
		this.db.run(sql`
			CREATE TABLE IF NOT EXISTS lobbies (
				id TEXT PRIMARY KEY,
				invite_code TEXT UNIQUE NOT NULL,
				kind TEXT NOT NULL DEFAULT 'private',
				host_player_id TEXT NOT NULL,
				config TEXT NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (unixepoch())
			)
		`)
		try {
			this.db.run(
				sql`ALTER TABLE lobbies ADD COLUMN kind TEXT NOT NULL DEFAULT 'private'`
			)
		} catch {
			// Existing Durable Objects already have the column after the first boot.
		}
		this.db.run(sql`
			CREATE TABLE IF NOT EXISTS lobby_players (
				lobby_id TEXT NOT NULL,
				player_id TEXT NOT NULL,
				username TEXT NOT NULL,
				tribe TEXT,
				is_bot INTEGER NOT NULL DEFAULT 0,
				bot_difficulty TEXT NOT NULL DEFAULT 'Beginner',
				is_ready INTEGER NOT NULL DEFAULT 0,
				is_host INTEGER NOT NULL DEFAULT 0,
				slot_index INTEGER NOT NULL,
				PRIMARY KEY (lobby_id, player_id),
				FOREIGN KEY (lobby_id) REFERENCES lobbies(id) ON DELETE CASCADE
			)
		`)
	}

	async createPrivateLobby(host: {
		playerId: string
		username: string
	}): Promise<CreateLobbyOutcome> {
		const hosted = await this.db
			.select({ id: lobbies.id })
			.from(lobbies)
			.where(
				and(
					eq(lobbies.hostPlayerId, host.playerId),
					eq(lobbies.kind, 'private')
				)
			)
		if (hosted.length >= maxLobbiesPerHost) {
			return { status: 'limit-reached' }
		}

		const lobbyId = crypto.randomUUID()
		const inviteCode = generateInviteCode()

		await this.db.insert(lobbies).values({
			id: lobbyId,
			inviteCode,
			kind: 'private',
			hostPlayerId: host.playerId,
			config: JSON.stringify(privateLobbyConfig),
			createdAt: nowSeconds()
		})

		await this.db.insert(lobbyPlayers).values({
			lobbyId,
			playerId: host.playerId,
			username: host.username,
			isHost: true,
			slotIndex: 0
		})

		return { status: 'created', lobbyId, inviteCode }
	}

	/**
	 * Sweeps lobbies older than {@link lobbyTtlSeconds} — the backstop for
	 * lobbies whose host never opened a WebSocket (REST create with no
	 * follow-up), which the disconnect path can't clean up. Called from the
	 * create/queue handlers so abandoned rows can't accumulate unboundedly.
	 */
	async deleteExpiredLobbies(now: number = nowSeconds()): Promise<number> {
		const expired = await this.db
			.select({ id: lobbies.id })
			.from(lobbies)
			.where(lt(lobbies.createdAt, now - lobbyTtlSeconds))
		// oxlint-disable eslint/no-await-in-loop, react-doctor/async-await-in-loop -- SQL deletion ordering stays serialized within this Durable Object.
		for (const row of expired) {
			await this.deleteLobby(row.id)
		}
		// oxlint-enable eslint/no-await-in-loop, react-doctor/async-await-in-loop
		return expired.length
	}

	async joinByInviteCode(
		inviteCode: string,
		player: { playerId: string; username: string }
	): Promise<JoinByInviteOutcome> {
		const [lobby] = await this.db
			.select({ id: lobbies.id, config: lobbies.config, kind: lobbies.kind })
			.from(lobbies)
			.where(eq(lobbies.inviteCode, inviteCode))
			.limit(1)

		if (!lobby) {
			return { status: 'not-found' }
		}
		if (lobby.kind !== 'private') {
			return { status: 'not-found' }
		}

		const config = parseLobbyConfig(lobby.config)
		if (!config) {
			return { status: 'invalid-config' }
		}

		const humans = await this.db
			.select({ playerId: lobbyPlayers.playerId })
			.from(lobbyPlayers)
			.where(
				and(eq(lobbyPlayers.lobbyId, lobby.id), eq(lobbyPlayers.isBot, false))
			)

		if (humans.length >= config.maxPlayers) {
			return { status: 'full' }
		}

		const existing = await this.db
			.select({ playerId: lobbyPlayers.playerId })
			.from(lobbyPlayers)
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobby.id),
					eq(lobbyPlayers.playerId, player.playerId)
				)
			)

		if (existing.length > 0) {
			return { status: 'already-joined', lobbyId: lobby.id }
		}

		const allSlots = await this.db
			.select({ slotIndex: lobbyPlayers.slotIndex })
			.from(lobbyPlayers)
			.where(eq(lobbyPlayers.lobbyId, lobby.id))
		if (allSlots.length >= config.maxPlayers) {
			return { status: 'full' }
		}
		const usedSlots = new Set(allSlots.map((s) => s.slotIndex))
		let nextSlot = 0
		while (usedSlots.has(nextSlot)) {
			nextSlot++
		}

		await this.db.insert(lobbyPlayers).values({
			lobbyId: lobby.id,
			playerId: player.playerId,
			username: player.username,
			slotIndex: nextSlot
		})

		return { status: 'joined', lobbyId: lobby.id }
	}

	async isMember(lobbyId: string, playerId: string): Promise<boolean> {
		const rows = await this.db
			.select({ playerId: lobbyPlayers.playerId })
			.from(lobbyPlayers)
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobbyId),
					eq(lobbyPlayers.playerId, playerId)
				)
			)
			.limit(1)
		return rows.length > 0
	}

	/**
	 * Kind-aware player listing — the single place that encodes the Public
	 * Queue rule: `publicQueue` lobbies are humans-only, so bot rows are
	 * excluded from every listing (lobby state, start snapshots, seat counts);
	 * `private` lobbies list bots as real slots. Ordered by slot index.
	 */
	async listPlayers(
		lobbyId: string,
		kind: LobbyKind
	): Promise<LobbyPlayerRow[]> {
		return this.db
			.select({
				playerId: lobbyPlayers.playerId,
				username: lobbyPlayers.username,
				tribe: lobbyPlayers.tribe,
				isBot: lobbyPlayers.isBot,
				botDifficulty: lobbyPlayers.botDifficulty,
				isReady: lobbyPlayers.isReady,
				isHost: lobbyPlayers.isHost,
				slotIndex: lobbyPlayers.slotIndex
			})
			.from(lobbyPlayers)
			.where(
				kind === 'publicQueue'
					? and(
							eq(lobbyPlayers.lobbyId, lobbyId),
							eq(lobbyPlayers.isBot, false)
						)
					: eq(lobbyPlayers.lobbyId, lobbyId)
			)
			.orderBy(lobbyPlayers.slotIndex)
	}

	/**
	 * Setting a tribe resets readiness — the player must re-confirm.
	 *
	 * The claim is a single conditional UPDATE (guarded by NOT EXISTS on a
	 * self-join) so two players racing for the same tribe can never both win
	 * regardless of how the SQLite driver interleaves statements.
	 */
	async setTribe(
		lobbyId: string,
		playerId: string,
		tribe: Tribe
	): Promise<'ok' | 'tribe-taken'> {
		const other = alias(lobbyPlayers, 'other')
		await this.db
			.update(lobbyPlayers)
			.set({ tribe, isReady: false })
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobbyId),
					eq(lobbyPlayers.playerId, playerId),
					notExists(
						this.db
							.select({ playerId: other.playerId })
							.from(other)
							.where(
								and(
									eq(other.lobbyId, lobbyId),
									eq(other.tribe, tribe),
									ne(other.playerId, playerId)
								)
							)
					)
				)
			)

		const [row] = await this.db
			.select({ tribe: lobbyPlayers.tribe })
			.from(lobbyPlayers)
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobbyId),
					eq(lobbyPlayers.playerId, playerId)
				)
			)
			.limit(1)

		return row?.tribe === tribe ? 'ok' : 'tribe-taken'
	}

	async setReady(
		lobbyId: string,
		playerId: string,
		ready: boolean
	): Promise<'ok' | 'tribe-required'> {
		if (ready) {
			const [player] = await this.db
				.select({ tribe: lobbyPlayers.tribe })
				.from(lobbyPlayers)
				.where(
					and(
						eq(lobbyPlayers.lobbyId, lobbyId),
						eq(lobbyPlayers.playerId, playerId)
					)
				)
				.limit(1)

			if (!player?.tribe) {
				return 'tribe-required'
			}
		}

		await this.db
			.update(lobbyPlayers)
			.set({ isReady: ready })
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobbyId),
					eq(lobbyPlayers.playerId, playerId)
				)
			)

		return 'ok'
	}

	async setSlotBot(
		lobbyId: string,
		requestedBy: string,
		slotIndex: number,
		isBot: boolean,
		difficulty?: Difficulty
	): Promise<
		'ok' | 'public-queue' | 'not-host' | 'no-tribe' | 'invalid-config'
	> {
		const [lobby] = await this.db
			.select({
				hostPlayerId: lobbies.hostPlayerId,
				kind: lobbies.kind,
				config: lobbies.config
			})
			.from(lobbies)
			.where(eq(lobbies.id, lobbyId))
			.limit(1)

		if (lobby?.kind === 'publicQueue') {
			return 'public-queue'
		}
		if (lobby?.hostPlayerId !== requestedBy) {
			return 'not-host'
		}

		if (isBot) {
			const config = parseLobbyConfig(lobby.config)
			const players = await this.listPlayers(lobbyId, 'private')
			const occupant = players.find((player) => player.slotIndex === slotIndex)
			if (
				!config ||
				!Number.isInteger(slotIndex) ||
				slotIndex < 0 ||
				slotIndex >= config.maxPlayers ||
				(occupant && !occupant.isBot) ||
				(!occupant && players.length >= config.maxPlayers)
			) {
				return 'invalid-config'
			}
			const botId = `bot_${slotIndex}`
			const tribe = await this.nextAvailableTribe(lobbyId, botId)
			if (tribe === null) {
				return 'no-tribe'
			}
			await this.db
				.insert(lobbyPlayers)
				.values({
					lobbyId,
					playerId: botId,
					username: `Bot ${slotIndex + 1}`,
					tribe,
					isBot: true,
					botDifficulty: difficulty ?? 'Beginner',
					isReady: true,
					slotIndex
				})
				.onConflictDoUpdate({
					target: [lobbyPlayers.lobbyId, lobbyPlayers.playerId],
					set: {
						tribe,
						isBot: true,
						botDifficulty: difficulty ?? 'Beginner',
						isReady: true
					}
				})
		} else {
			await this.db
				.delete(lobbyPlayers)
				.where(
					and(
						eq(lobbyPlayers.lobbyId, lobbyId),
						eq(lobbyPlayers.slotIndex, slotIndex),
						eq(lobbyPlayers.isBot, true)
					)
				)
		}

		return 'ok'
	}

	async configure(
		lobbyId: string,
		requestedBy: string,
		patch: Partial<LobbyConfig>
	): Promise<'ok' | 'not-host' | 'invalid-config'> {
		const [lobby] = await this.db
			.select({ hostPlayerId: lobbies.hostPlayerId, config: lobbies.config })
			.from(lobbies)
			.where(eq(lobbies.id, lobbyId))
			.limit(1)

		if (lobby?.hostPlayerId !== requestedBy) {
			return 'not-host'
		}

		const current = parseLobbyConfig(lobby.config)
		if (!current) {
			return 'invalid-config'
		}
		const updated = { ...current, ...patch }
		const players = await this.listPlayers(lobbyId, 'private')
		if (
			!isValidLobbyConfig(updated) ||
			players.some((player) => player.slotIndex >= updated.maxPlayers) ||
			players.length > updated.maxPlayers
		) {
			return 'invalid-config'
		}

		await this.db
			.update(lobbies)
			.set({ config: JSON.stringify(updated) })
			.where(eq(lobbies.id, lobbyId))

		return 'ok'
	}

	/**
	 * Removes a player. Deletes the lobby when no humans remain (bots never
	 * keep a lobby alive); otherwise transfers host to the lowest-slot human
	 * if the host left.
	 */
	async removePlayer(
		lobbyId: string,
		playerId: string
	): Promise<'lobby-deleted' | 'players-remain'> {
		await this.db
			.delete(lobbyPlayers)
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobbyId),
					eq(lobbyPlayers.playerId, playerId)
				)
			)

		const remaining = await this.db
			.select({ playerId: lobbyPlayers.playerId })
			.from(lobbyPlayers)
			.where(
				and(eq(lobbyPlayers.lobbyId, lobbyId), eq(lobbyPlayers.isBot, false))
			)

		if (remaining.length === 0) {
			await this.deleteLobby(lobbyId)
			return 'lobby-deleted'
		}

		const [lobby] = await this.db
			.select({ hostPlayerId: lobbies.hostPlayerId })
			.from(lobbies)
			.where(eq(lobbies.id, lobbyId))
			.limit(1)

		const newHost = remaining[0]
		if (lobby?.hostPlayerId === playerId && newHost !== undefined) {
			await this.db
				.update(lobbies)
				.set({ hostPlayerId: newHost.playerId })
				.where(eq(lobbies.id, lobbyId))
			await this.db
				.update(lobbyPlayers)
				.set({ isHost: true })
				.where(
					and(
						eq(lobbyPlayers.lobbyId, lobbyId),
						eq(lobbyPlayers.playerId, newHost.playerId)
					)
				)
		}

		return 'players-remain'
	}

	/** Deletes the lobby and all its player rows (post-start cleanup). */
	async deleteLobby(lobbyId: string): Promise<void> {
		await this.db.delete(lobbyPlayers).where(eq(lobbyPlayers.lobbyId, lobbyId))
		await this.db.delete(lobbies).where(eq(lobbies.id, lobbyId))
	}

	async getLobbyState(lobbyId: string): Promise<LobbyState | null> {
		const [lobby] = await this.db
			.select({
				id: lobbies.id,
				inviteCode: lobbies.inviteCode,
				kind: lobbies.kind,
				config: lobbies.config
			})
			.from(lobbies)
			.where(eq(lobbies.id, lobbyId))
			.limit(1)

		if (!lobby) {
			return null
		}
		if (!isLobbyKind(lobby.kind)) {
			return null
		}
		const config = parseLobbyConfig(lobby.config)
		if (!config) {
			return null
		}

		const players = await this.listPlayers(lobbyId, lobby.kind)

		const slots: LobbySlot[] = []
		for (const player of players) {
			const tribe =
				player.tribe !== null && isTribe(player.tribe) ? player.tribe : null
			if (player.tribe !== null && tribe === null) {
				return null
			}
			if (!isDifficulty(player.botDifficulty)) {
				return null
			}
			slots.push({
				playerId: player.playerId,
				username: player.username,
				tribe,
				isBot: player.isBot,
				botDifficulty: player.botDifficulty,
				isReady: player.isReady,
				isHost: player.isHost
			})
		}

		return {
			lobbyId: lobby.id,
			inviteCode: lobby.inviteCode,
			kind: lobby.kind,
			config,
			slots,
			phase: 'waiting'
		}
	}

	/**
	 * Start-lobby read path: computes readiness and, when the lobby can
	 * start, returns the validated snapshot plus the start idempotency key.
	 * The caller hands both to the `MatchInitializer` port and must delete
	 * the lobby on a started outcome.
	 */
	async readStartContext(
		lobbyId: string,
		requestedBy?: string
	): Promise<StartContext> {
		const [lobby] = await this.db
			.select({
				hostPlayerId: lobbies.hostPlayerId,
				kind: lobbies.kind,
				config: lobbies.config,
				createdAt: lobbies.createdAt
			})
			.from(lobbies)
			.where(eq(lobbies.id, lobbyId))
			.limit(1)

		const unready = lobby
			? await this.db
					.select({ playerId: lobbyPlayers.playerId })
					.from(lobbyPlayers)
					.where(
						and(
							eq(lobbyPlayers.lobbyId, lobbyId),
							eq(lobbyPlayers.isBot, false),
							sql`(${lobbyPlayers.isReady} = 0 OR ${lobbyPlayers.tribe} IS NULL)`
						)
					)
			: []

		const config = lobby ? parseLobbyConfig(lobby.config) : null
		const readiness = computeLobbyReadiness({
			lobby: lobby
				? { kind: lobby.kind, hostPlayerId: lobby.hostPlayerId }
				: null,
			configValid: config !== null,
			unreadyPlayerIds: unready.map((p) => p.playerId),
			requestedBy
		})
		if (!readiness.canStart || !lobby || !config) {
			return { status: 'blocked', readiness }
		}

		const players = await this.listPlayers(lobbyId, lobby.kind)
		const parsed = parseLobbySnapshot({
			lobbyId,
			kind: lobby.kind,
			config,
			slots: players.map((p) => ({
				slotIndex: p.slotIndex,
				playerId: p.playerId,
				username: p.username,
				tribe: p.tribe,
				isBot: p.isBot,
				botDifficulty: p.botDifficulty
			}))
		})
		if (Result.isFailure(parsed)) {
			return {
				status: 'blocked',
				readiness: {
					canStart: false,
					blockingReasons: [{ kind: 'invalid-state', issues: parsed.failure }]
				}
			}
		}

		return {
			status: 'ready',
			snapshot: parsed.success,
			idempotencyKey: startIdempotencyKey(lobbyId, lobby.createdAt)
		}
	}

	/**
	 * Seats a player in the oldest Public Queue lobby with room (creating one
	 * when none fits). Joining is idempotent — an already-queued player keeps
	 * their seat. Tribes and slots are auto-assigned; players enter ready.
	 */
	async joinPublicQueue(player: {
		playerId: string
		username: string
	}): Promise<PublicQueueEntry> {
		const existing = await this.db
			.select({ id: lobbies.id, config: lobbies.config })
			.from(lobbies)
			.where(eq(lobbies.kind, 'publicQueue'))
			.orderBy(lobbies.createdAt)

		// oxlint-disable eslint/no-await-in-loop -- Queue admission chooses the first available lobby after its preceding cleanup and seat read.
		for (const lobby of existing) {
			const parsedConfig = parseLobbyConfig(lobby.config)
			if (!parsedConfig) {
				continue
			}
			await this.deleteBots(lobby.id)
			const seats = await this.listPlayers(lobby.id, 'publicQueue')
			const alreadyQueued = seats.some((p) => p.playerId === player.playerId)
			if (alreadyQueued || seats.length < parsedConfig.maxPlayers) {
				const playerCount = alreadyQueued
					? seats.length
					: await this.seatPublicQueuePlayer(lobby.id, player, seats)
				return {
					lobbyId: lobby.id,
					config: parsedConfig,
					playerCount,
					entered: 'existing'
				}
			}
		}

		// oxlint-enable eslint/no-await-in-loop
		const lobbyId = crypto.randomUUID()
		await this.db.insert(lobbies).values({
			id: lobbyId,
			inviteCode: generateInviteCode(),
			kind: 'publicQueue',
			hostPlayerId: player.playerId,
			config: JSON.stringify(publicQueueConfig),
			createdAt: nowSeconds()
		})
		const playerCount = await this.seatPublicQueuePlayer(lobbyId, player, [])

		return {
			lobbyId,
			config: publicQueueConfig,
			playerCount,
			entered: 'created'
		}
	}

	/** Returns the resulting human seat count (unchanged when no tribe is free). */
	private async seatPublicQueuePlayer(
		lobbyId: string,
		player: { playerId: string; username: string },
		seats: readonly LobbyPlayerRow[]
	): Promise<number> {
		if (seats.some((p) => p.playerId === player.playerId)) {
			return seats.length
		}

		const usedSlots = new Set(seats.map((p) => p.slotIndex))
		const usedTribes = new Set(seats.map((p) => p.tribe))
		let nextSlot = 0
		while (usedSlots.has(nextSlot)) {
			nextSlot++
		}
		const tribe = tribes.find((t) => !usedTribes.has(t))
		if (!tribe) {
			return seats.length
		}

		await this.db.insert(lobbyPlayers).values({
			lobbyId,
			playerId: player.playerId,
			username: player.username,
			tribe,
			isReady: true,
			isHost: nextSlot === 0,
			slotIndex: nextSlot
		})
		return seats.length + 1
	}

	private async deleteBots(lobbyId: string): Promise<void> {
		await this.db
			.delete(lobbyPlayers)
			.where(
				and(eq(lobbyPlayers.lobbyId, lobbyId), eq(lobbyPlayers.isBot, true))
			)
	}

	private async nextAvailableTribe(
		lobbyId: string,
		playerId: string
	): Promise<Tribe | null> {
		const players = await this.db
			.select({ tribe: lobbyPlayers.tribe })
			.from(lobbyPlayers)
			.where(
				and(
					eq(lobbyPlayers.lobbyId, lobbyId),
					ne(lobbyPlayers.playerId, playerId)
				)
			)
		const usedTribes = new Set(players.map((p) => p.tribe))
		return tribes.find((t) => !usedTribes.has(t)) ?? null
	}
}
