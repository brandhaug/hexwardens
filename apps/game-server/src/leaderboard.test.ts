import { it } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'
import { layerFromClient } from '@hexwardens/db/effect'
import { PlayerId, Username } from '@hexwardens/game-logic/ids'
import {
	Leaderboard,
	LeaderboardLive,
	type LeaderboardArgs,
	type PageArgs
} from './leaderboard'
import {
	createD1Fixture,
	seedMatchResults as seed,
	seedUser,
	type D1Fixture,
	type SeedMatchResultRow
} from './test/d1-fixture'

const layerFor = (fixture: D1Fixture) =>
	LeaderboardLive.pipe(Layer.provide(layerFromClient(fixture.db)))

const getLeaderboard = (args: LeaderboardArgs) =>
	Effect.gen(function* () {
		const lb = yield* Leaderboard
		return yield* lb.getLeaderboard(args)
	})

const getProfile = (username: string) =>
	Effect.gen(function* () {
		const lb = yield* Leaderboard
		return yield* lb.getPlayerProfile(Username.make(username))
	})

const getHistory = (playerId: string, page: PageArgs) =>
	Effect.gen(function* () {
		const lb = yield* Leaderboard
		return yield* lb.getMatchHistory(PlayerId.make(playerId), page)
	})

describe('getLeaderboard', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('ranks players by total wins and excludes bots', () =>
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
						matchId: 'm3',
						playerId: 'a',
						username: 'alice',
						tribe: 'orcs',
						isWinner: 0,
						isBot: 0
					},
					{
						matchId: 'm1',
						playerId: 'b',
						username: 'bob',
						tribe: 'rogues',
						isWinner: 0,
						isBot: 0
					},
					{
						matchId: 'm2',
						playerId: 'b',
						username: 'bob',
						tribe: 'templars',
						isWinner: 0,
						isBot: 0
					},
					{
						matchId: 'm4',
						playerId: 'b',
						username: 'bob',
						tribe: 'wraiths',
						isWinner: 1,
						isBot: 0
					},
					{
						matchId: 'm3',
						playerId: 'bot-r',
						username: 'robo',
						tribe: 'barbarians',
						isWinner: 1,
						isBot: 1
					},
					{
						matchId: 'm4',
						playerId: 'bot-r',
						username: 'robo',
						tribe: 'druids',
						isWinner: 0,
						isBot: 1
					},
					{
						matchId: 'm5',
						playerId: 'bot-r',
						username: 'robo',
						tribe: 'skeletons',
						isWinner: 1,
						isBot: 1
					}
				])
			)

			const page = yield* getLeaderboard({
				sort: 'wins',
				limit: 10,
				offset: 0
			})

			expect(page.total).toBe(2)
			expect(page.entries.map((e) => e.username)).toEqual(['alice', 'bob'])
			expect(page.entries[0]).toMatchObject({
				playerId: 'a',
				username: 'alice',
				wins: 2,
				matches: 3,
				losses: 1
			})
			expect(page.entries[0]?.winRate).toBeCloseTo(2 / 3, 5)
			expect(page.entries[1]).toMatchObject({
				playerId: 'b',
				username: 'bob',
				wins: 1,
				matches: 3,
				losses: 2
			})
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'filters by tribe: wins and matches count only rows for that tribe',
		() =>
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
							matchId: 'm3',
							playerId: 'a',
							username: 'alice',
							tribe: 'orcs',
							isWinner: 0,
							isBot: 0
						},
						{
							matchId: 'm4',
							playerId: 'b',
							username: 'bob',
							tribe: 'barbarians',
							isWinner: 1,
							isBot: 0
						},
						{
							matchId: 'm5',
							playerId: 'b',
							username: 'bob',
							tribe: 'barbarians',
							isWinner: 0,
							isBot: 0
						},
						{
							matchId: 'm6',
							playerId: 'b',
							username: 'bob',
							tribe: 'rogues',
							isWinner: 1,
							isBot: 0
						},
						{
							matchId: 'm7',
							playerId: 'c',
							username: 'carol',
							tribe: 'rogues',
							isWinner: 1,
							isBot: 0
						},
						{
							matchId: 'm8',
							playerId: 'bot-r',
							username: 'robo',
							tribe: 'barbarians',
							isWinner: 1,
							isBot: 1
						}
					])
				)

				const page = yield* getLeaderboard({
					sort: 'wins',
					tribe: 'barbarians',
					limit: 10,
					offset: 0
				})

				expect(page.total).toBe(2)
				expect(page.entries.map((e) => e.username)).toEqual(['alice', 'bob'])
				expect(page.entries[0]).toMatchObject({
					username: 'alice',
					wins: 1,
					matches: 1,
					losses: 0
				})
				expect(page.entries[1]).toMatchObject({
					username: 'bob',
					wins: 1,
					matches: 2,
					losses: 1
				})
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('sorts by win rate and excludes players below minMatches', () =>
		Effect.gen(function* () {
			const rows: SeedMatchResultRow[] = []
			const push = (
				id: string,
				name: string,
				wins: number,
				matches: number
			) => {
				for (let i = 0; i < matches; i++) {
					rows.push({
						matchId: `${id}-m${i}`,
						playerId: id,
						username: name,
						tribe: 'barbarians',
						isWinner: i < wins ? 1 : 0,
						isBot: 0
					})
				}
			}
			push('lucky', 'lucky', 1, 1) // 100% but only 1 match — excluded
			push('grinder', 'grinder', 5, 10) // 50%
			push('veteran', 'veteran', 12, 20) // 60%
			yield* Effect.promise(() => seed(fixture, rows))

			const page = yield* getLeaderboard({
				sort: 'winRate',
				minMatches: 5,
				limit: 10,
				offset: 0
			})

			expect(page.entries.map((e) => e.username)).toEqual([
				'veteran',
				'grinder'
			])
			expect(page.total).toBe(2)
		}).pipe(Effect.provide(layerFor(fixture)))
	)
})

describe('getPlayerProfile', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect(
		'returns overall stats + per-tribe breakdown for a known player',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'a', username: 'alice' })
				)
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'b', username: 'bob' })
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
						},
						{
							matchId: 'm2',
							playerId: 'a',
							username: 'alice',
							tribe: 'barbarians',
							isWinner: 0,
							isBot: 0
						},
						{
							matchId: 'm3',
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

				const profile = Option.getOrNull(yield* getProfile('alice'))

				expect(profile).not.toBeNull()
				if (profile === null) {
					throw new Error('unreachable')
				}
				expect(profile.user).toEqual({ playerId: 'a', username: 'alice' })
				expect(profile.overallStats).toMatchObject({
					wins: 2,
					losses: 1,
					matches: 3
				})
				expect(profile.overallStats.winRate).toBeCloseTo(2 / 3, 5)

				const byTribe = new Map(profile.tribeStats.map((t) => [t.tribe, t]))
				expect(byTribe.get('barbarians')).toMatchObject({ wins: 1, matches: 2 })
				expect(byTribe.get('rogues')).toMatchObject({ wins: 1, matches: 1 })
				expect(byTribe.size).toBe(2)
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('returns null for unknown username', () =>
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
					}
				])
			)

			const profile = Option.getOrNull(yield* getProfile('nobody'))
			expect(profile).toBeNull()
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'returns an empty profile for a user with no completed matches',
		() =>
			Effect.gen(function* () {
				// Newly-signed-up user: row exists in `user`, no `player_match_results`.
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'a', username: 'alice' })
				)

				const profile = Option.getOrNull(yield* getProfile('alice'))

				expect(profile).not.toBeNull()
				if (profile === null) {
					throw new Error('unreachable')
				}
				expect(profile.user).toEqual({ playerId: 'a', username: 'alice' })
				expect(profile.overallStats).toEqual({
					wins: 0,
					losses: 0,
					matches: 0,
					winRate: 0
				})
				expect(profile.tribeStats).toEqual([])
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('matches usernames case-insensitively', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'brandhaug' })
			)

			const lower = Option.getOrNull(yield* getProfile('brandhaug'))
			const mixed = Option.getOrNull(yield* getProfile('BrandHaug'))
			const upper = Option.getOrNull(yield* getProfile('BRANDHAUG'))

			expect(lower?.user.username).toBe('brandhaug')
			expect(mixed?.user.username).toBe('brandhaug')
			expect(upper?.user.username).toBe('brandhaug')
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'resolves users whose username column is null via displayUsername',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					seedUser(fixture, {
						id: 'a',
						username: null,
						displayUsername: 'Brandhaug',
						name: 'Brandhaug'
					})
				)

				const profile = Option.getOrNull(yield* getProfile('brandhaug'))
				expect(profile).not.toBeNull()
				expect(profile?.user).toEqual({ playerId: 'a', username: 'Brandhaug' })
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('resolves users whose username column is null via name', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, {
					id: 'a',
					username: null,
					displayUsername: null,
					name: 'Brandhaug'
				})
			)

			const profile = Option.getOrNull(yield* getProfile('brandhaug'))
			expect(profile).not.toBeNull()
			expect(profile?.user).toEqual({ playerId: 'a', username: 'Brandhaug' })
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'resolves by canonical user.username, not by historical pmr snapshot',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'a', username: 'alice_new' })
				)
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'b', username: 'bob' })
				)
				yield* Effect.promise(() =>
					seed(fixture, [
						{
							matchId: 'm1',
							playerId: 'a',
							username: 'alice_old',
							tribe: 'barbarians',
							isWinner: 1,
							isBot: 0
						},
						{
							matchId: 'm2',
							playerId: 'b',
							username: 'alice_old',
							tribe: 'rogues',
							isWinner: 0,
							isBot: 0
						}
					])
				)

				const profile = Option.getOrNull(yield* getProfile('alice_new'))
				expect(profile).not.toBeNull()
				if (profile === null) {
					throw new Error('unreachable')
				}
				expect(profile.user).toEqual({ playerId: 'a', username: 'alice_new' })
				expect(profile.overallStats).toMatchObject({ wins: 1, matches: 1 })

				expect(Option.getOrNull(yield* getProfile('alice_old'))).toBeNull()
			}).pipe(Effect.provide(layerFor(fixture)))
	)
})

describe('getMatchHistory', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect("returns a player's matches newest-first with pagination", () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seed(fixture, [
					{
						matchId: 'm1',
						playerId: 'a',
						username: 'alice',
						tribe: 'barbarians',
						isWinner: 1,
						isBot: 0,
						completedAt: '2026-01-01T00:00:00Z'
					},
					{
						matchId: 'm2',
						playerId: 'a',
						username: 'alice',
						tribe: 'rogues',
						isWinner: 0,
						isBot: 0,
						completedAt: '2026-01-02T00:00:00Z'
					},
					{
						matchId: 'm3',
						playerId: 'a',
						username: 'alice',
						tribe: 'orcs',
						isWinner: 1,
						isBot: 0,
						completedAt: '2026-01-03T00:00:00Z'
					},
					{
						matchId: 'm1',
						playerId: 'b',
						username: 'bob',
						tribe: 'wraiths',
						isWinner: 0,
						isBot: 0,
						completedAt: '2026-01-01T00:00:00Z'
					}
				])
			)

			const page1 = yield* getHistory('a', { limit: 2, offset: 0 })
			expect(page1.map((m) => m.matchId)).toEqual(['m3', 'm2'])
			expect(page1[0]).toMatchObject({
				matchId: 'm3',
				tribe: 'orcs',
				isWinner: true,
				completedAt: '2026-01-03T00:00:00Z'
			})

			const page2 = yield* getHistory('a', { limit: 2, offset: 2 })
			expect(page2.map((m) => m.matchId)).toEqual(['m1'])
			expect(page2[0]?.isWinner).toBe(true)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('returns empty array for unknown player', () =>
		Effect.gen(function* () {
			const history = yield* getHistory('nobody', { limit: 10, offset: 0 })
			expect(history).toEqual([])
		}).pipe(Effect.provide(layerFor(fixture)))
	)
})

describe('empty state', () => {
	it('getLeaderboard returns zero entries when no matches exist', async () => {
		const fixture = await createD1Fixture()
		try {
			const page = await Effect.runPromise(
				getLeaderboard({ sort: 'wins', limit: 10, offset: 0 }).pipe(
					Effect.provide(layerFor(fixture))
				)
			)
			expect(page.entries).toEqual([])
			expect(page.total).toBe(0)
		} finally {
			await fixture.close()
		}
	})
})
