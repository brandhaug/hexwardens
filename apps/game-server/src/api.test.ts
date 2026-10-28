const decodeHealth = Schema.decodeUnknownEffect(
	Schema.Struct({ status: Schema.String })
)
const decodePresence = Schema.decodeUnknownEffect(
	Schema.Struct({ online: Schema.Finite })
)
const decodeCosmetics = Schema.decodeUnknownEffect(
	Schema.Struct({ username: Schema.String })
)
const decodeAchievements = Schema.decodeUnknownEffect(
	Schema.Struct({ username: Schema.String, unlocks: Schema.Array(Schema.Json) })
)
const decodeProfile = Schema.decodeUnknownEffect(
	Schema.Struct({
		profile: Schema.Struct({
			user: Schema.Struct({ username: Schema.String })
		}),
		recentMatches: Schema.Array(Schema.Struct({ matchId: Schema.String }))
	})
)
const decodeMissingProfile = Schema.decodeUnknownEffect(
	Schema.Struct({ _tag: Schema.String })
)
const decodeLeaderboard = Schema.decodeUnknownEffect(
	Schema.Struct({
		total: Schema.Finite,
		entries: Schema.Array(Schema.Struct({ username: Schema.String }))
	})
)
import { it } from '@effect/vitest'
import { Effect, Layer, Schema } from 'effect'
import { HttpRouter } from 'effect/http'
import { layerFromClient } from '@hexwardens/db/effect'
import { makeApiLive } from './api-router'
import { PresenceCounter } from './presence-service'
import {
	createD1Fixture,
	seedMatchResults as seed,
	seedUser,
	type D1Fixture
} from './test/d1-fixture'

const TEST_ENV = {
	AUTH_JWT_SECRET: 'test-secret-please-change-12345678'
}

const stubPresence = Layer.succeed(PresenceCounter, {
	count: Effect.succeed(0)
})

const handlerFor = (fixture: D1Fixture) =>
	HttpRouter.toWebHandler(
		makeApiLive(TEST_ENV, layerFromClient(fixture.db), stubPresence),
		{ disableLogger: true }
	).handler

describe('GET /leaderboard', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns paged entries with totals', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seed(fixture, [
					{
						matchId: 'm1',
						playerId: 'a',
						username: 'alice',
						tribe: 'barbarians',
						isWinner: 1,
						isBot: 0
					},
					{
						matchId: 'm2',
						playerId: 'a',
						username: 'alice',
						tribe: 'rogues',
						isWinner: 1,
						isBot: 0
					},
					{
						matchId: 'm1',
						playerId: 'b',
						username: 'bob',
						tribe: 'rogues',
						isWinner: 0,
						isBot: 0
					}
				])
			)

			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(
					new Request(
						'http://localhost/leaderboard?sort=wins&limit=10&offset=0'
					)
				)
			)

			expect(response.status).toBe(200)
			const body = yield* decodeLeaderboard(
				yield* Effect.promise(() => response.json())
			)
			expect(body.total).toBe(2)
			expect(body.entries.map((e) => e.username)).toEqual(['alice', 'bob'])
		})
	)

	it.effect('returns 400 on invalid sort param', () =>
		Effect.gen(function* () {
			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/leaderboard?sort=banana'))
			)
			expect(response.status).toBe(400)
		})
	)
})

describe('GET /profile/:username', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns 404 for unknown username', () =>
		Effect.gen(function* () {
			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/profile/nobody'))
			)
			expect(response.status).toBe(404)
			const body = yield* decodeMissingProfile(
				yield* Effect.promise(() => response.json())
			)
			expect(body._tag).toBe('PlayerNotFoundError')
		})
	)

	it.effect('returns profile + recent matches for a known player', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)
			yield* Effect.promise(() =>
				seed(fixture, [
					{
						matchId: 'm1',
						playerId: 'a',
						username: 'alice',
						tribe: 'barbarians',
						isWinner: 1,
						isBot: 0
					}
				])
			)

			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/profile/alice'))
			)
			expect(response.status).toBe(200)
			const body = yield* decodeProfile(
				yield* Effect.promise(() => response.json())
			)
			expect(body.profile.user.username).toBe('alice')
			expect(body.recentMatches.map((m) => m.matchId)).toEqual(['m1'])
		})
	)
})

describe('GET /achievements/:username', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns 404 for unknown username', () =>
		Effect.gen(function* () {
			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/achievements/nobody'))
			)
			expect(response.status).toBe(404)
		})
	)

	it.effect('returns username + unlocks for a known player', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)

			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/achievements/alice'))
			)
			expect(response.status).toBe(200)
			const body = yield* decodeAchievements(
				yield* Effect.promise(() => response.json())
			)
			expect(body.username).toBe('alice')
			expect(body.unlocks).toEqual([])
		})
	)
})

describe('GET /cosmetics/:username', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns 404 for unknown username', () =>
		Effect.gen(function* () {
			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/cosmetics/nobody'))
			)
			expect(response.status).toBe(404)
		})
	)

	it.effect('returns cosmetics for a known player', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)

			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/cosmetics/alice'))
			)
			expect(response.status).toBe(200)
			const body = yield* decodeCosmetics(
				yield* Effect.promise(() => response.json())
			)
			expect(body.username).toBe('alice')
		})
	)
})

describe('GET /presence', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns the live online count from the injected service', () =>
		Effect.gen(function* () {
			const handler = HttpRouter.toWebHandler(
				makeApiLive(
					TEST_ENV,
					layerFromClient(fixture.db),
					Layer.succeed(PresenceCounter, {
						count: Effect.succeed(42)
					})
				),
				{ disableLogger: true }
			).handler

			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/presence'))
			)
			expect(response.status).toBe(200)
			const body = yield* decodePresence(
				yield* Effect.promise(() => response.json())
			)
			expect(body.online).toBe(42)
		})
	)
})

describe('GET /health', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns ok status', () =>
		Effect.gen(function* () {
			const handler = handlerFor(fixture)
			const response = yield* Effect.promise(() =>
				handler(new Request('http://localhost/health'))
			)
			expect(response.status).toBe(200)
			const body = yield* decodeHealth(
				yield* Effect.promise(() => response.json())
			)
			expect(body.status).toBe('ok')
		})
	)
})
