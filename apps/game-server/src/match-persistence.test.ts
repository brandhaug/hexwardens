import { it } from '@effect/vitest'
import { Effect, Fiber, Layer } from 'effect'
import * as TestClock from 'effect/testing/TestClock'
import { DatabaseError, layerFromClient } from '@hexwardens/db/effect'
import { MatchId, PlayerId, Username } from '@hexwardens/game-logic/ids'
import { matchResults } from '@hexwardens/db/schema'
import { persistenceRetryPolicy, writeMatchResult } from './match-persistence'
import { Leaderboard, LeaderboardLive } from './leaderboard'
import { createD1Fixture, type D1Fixture } from './test/d1-fixture'
import { type MatchResult } from './types'

const pid = (s: string) => PlayerId.make(s)
const mid = (s: string) => MatchId.make(s)
const un = (s: string) => Username.make(s)

const layerFor = (fixture: D1Fixture) => {
	const dbLayer = layerFromClient(fixture.db)
	return Layer.mergeAll(dbLayer, LeaderboardLive.pipe(Layer.provide(dbLayer)))
}

describe('writeMatchResult', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect(
		'populates player_match_results so the leaderboard picks up the game',
		() =>
			Effect.gen(function* () {
				const result: MatchResult = {
					matchId: mid('match-1'),
					winner: 'barbarians',
					players: [
						{
							playerId: pid('alice'),
							username: un('alice'),
							tribe: 'barbarians',
							isBot: false
						},
						{
							playerId: pid('bob'),
							username: un('bob'),
							tribe: 'rogues',
							isBot: false
						},
						{
							playerId: pid('bot-1'),
							username: un('bot'),
							tribe: 'orcs',
							isBot: true
						}
					],
					duration: 600,
					turnCount: 30,
					mapSize: 'small',
					completedAt: '2026-04-01T00:00:00Z'
				}

				yield* writeMatchResult(result)

				const lb = yield* Leaderboard
				const leaderboard = yield* lb.getLeaderboard({
					sort: 'wins',
					limit: 10,
					offset: 0
				})
				expect(leaderboard.total).toBe(2)
				expect(leaderboard.entries[0]).toMatchObject({
					username: 'alice',
					wins: 1,
					matches: 1
				})
				expect(leaderboard.entries[1]).toMatchObject({
					username: 'bob',
					wins: 0,
					matches: 1
				})

				const aliceHistory = yield* lb.getMatchHistory(PlayerId.make('alice'), {
					limit: 10,
					offset: 0
				})
				expect(aliceHistory).toEqual([
					{
						matchId: 'match-1',
						tribe: 'barbarians',
						isWinner: true,
						completedAt: '2026-04-01T00:00:00Z'
					}
				])
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'is idempotent: writing the same match result twice does not double-count',
		() =>
			Effect.gen(function* () {
				const result: MatchResult = {
					matchId: mid('match-dup'),
					winner: 'barbarians',
					players: [
						{
							playerId: pid('alice'),
							username: un('alice'),
							tribe: 'barbarians',
							isBot: false
						},
						{
							playerId: pid('bob'),
							username: un('bob'),
							tribe: 'rogues',
							isBot: false
						}
					],
					duration: 600,
					turnCount: 30,
					mapSize: 'small',
					completedAt: '2026-04-01T00:00:00Z'
				}

				yield* writeMatchResult(result)
				yield* writeMatchResult(result)

				const lb = yield* Leaderboard
				const leaderboard = yield* lb.getLeaderboard({
					sort: 'wins',
					limit: 10,
					offset: 0
				})
				expect(leaderboard.total).toBe(2)
				expect(leaderboard.entries[0]).toMatchObject({
					username: 'alice',
					wins: 1,
					matches: 1
				})

				const aliceHistory = yield* lb.getMatchHistory(PlayerId.make('alice'), {
					limit: 10,
					offset: 0
				})
				expect(aliceHistory).toHaveLength(1)
			}).pipe(Effect.provide(layerFor(fixture)))
	)
})

const transient = () =>
	new DatabaseError({ operation: 'saveMatchResult', message: 'transient' })

describe('persistenceRetryPolicy', () => {
	it.effect('retries transient failures until the write lands', () =>
		Effect.gen(function* () {
			let attempts = 0
			const flaky = Effect.suspend(() => {
				attempts++
				return attempts < 3 ? Effect.fail(transient()) : Effect.succeed('saved')
			})
			const fiber = yield* Effect.forkChild(
				flaky.pipe(Effect.retry(persistenceRetryPolicy))
			)
			yield* TestClock.adjust('1 second')
			expect(yield* Fiber.join(fiber)).toBe('saved')
			expect(attempts).toBe(3)
		})
	)

	it.effect('gives up after three retries and surfaces the failure', () =>
		Effect.gen(function* () {
			let attempts = 0
			const alwaysFailing = Effect.suspend(() => {
				attempts++
				return Effect.fail(transient())
			})
			const fiber = yield* Effect.forkChild(
				Effect.flip(alwaysFailing.pipe(Effect.retry(persistenceRetryPolicy)))
			)
			yield* TestClock.adjust('1 minute')
			const error = yield* Fiber.join(fiber)
			expect(error._tag).toBe('DatabaseError')
			expect(attempts).toBe(4) // initial attempt + 3 retries
		})
	)
})

describe('D1 batch atomicity', () => {
	it('rolls back the whole batch when one statement fails', async () => {
		const fixture = await createD1Fixture()
		try {
			const first = fixture.db.insert(matchResults).values({
				matchId: 'm-ok',
				winnerTribe: 'barbarians',
				players: [],
				duration: 0,
				turnCount: 0,
				mapSize: 'small',
				completedAt: '2026-01-01T00:00:00Z'
			})
			// Duplicate primary key without onConflictDoNothing → mid-batch failure.
			const dup = fixture.db.insert(matchResults).values({
				matchId: 'm-ok',
				winnerTribe: 'orcs',
				players: [],
				duration: 0,
				turnCount: 0,
				mapSize: 'small',
				completedAt: '2026-01-01T00:00:00Z'
			})

			await expect(fixture.db.batch([first, dup])).rejects.toThrow(
				/UNIQUE|constraint|query/i
			)
			expect(await fixture.countRows('matchResults')).toBe(0)
		} finally {
			await fixture.close()
		}
	})
})
