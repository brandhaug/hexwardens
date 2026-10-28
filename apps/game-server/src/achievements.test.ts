import { assert } from 'vite-plus/test'
import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { layerFromClient } from '@hexwardens/db/effect'
import { user } from '@hexwardens/db/schema'
import { MatchId, PlayerId, Username } from '@hexwardens/game-logic/ids'
import { Achievements, AchievementsLive } from './achievements'
import { writeMatchResult } from './match-persistence'
import { createD1Fixture, type D1Fixture } from './test/d1-fixture'
import { type MatchConfig, type MatchResult } from './types'

const pid = (s: string) => PlayerId.make(s)
const mid = (s: string) => MatchId.make(s)
const un = (s: string) => Username.make(s)

const layerFor = (fixture: D1Fixture) => {
	const dbLayer = layerFromClient(fixture.db)
	return Layer.mergeAll(dbLayer, AchievementsLive.pipe(Layer.provide(dbLayer)))
}

const seedUser = (fixture: D1Fixture, id: string, username: string) =>
	fixture.db
		.insert(user)
		.values({
			id,
			email: `${id}@example.com`,
			name: username,
			username,
			displayUsername: username
		})
		.run()

const baseConfig = (): MatchConfig => ({
	mapSize: 'small',
	turnTimerSeconds: null,
	players: [
		{
			playerId: 'alice',
			username: 'alice',
			tribe: 'barbarians',
			isBot: false,
			botDifficulty: 'Beginner'
		},
		{
			playerId: 'bot-1',
			username: 'bot',
			tribe: 'rogues',
			isBot: true,
			botDifficulty: 'Beginner'
		}
	]
})

const baseResult = (overrides: Partial<MatchResult> = {}): MatchResult => ({
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
			playerId: pid('bot-1'),
			username: un('bot'),
			tribe: 'rogues',
			isBot: true
		}
	],
	duration: 600,
	turnCount: 30,
	mapSize: 'small',
	completedAt: '2026-04-01T00:00:00Z',
	...overrides
})

const writeAndEvaluate = (result: MatchResult, config: MatchConfig) =>
	Effect.gen(function* () {
		yield* writeMatchResult(result)
		const a = yield* Achievements
		return yield* a.evaluateAndPersist({ result, config })
	})

const getUnlocks = (playerId: string) =>
	Effect.gen(function* () {
		const a = yield* Achievements
		return yield* a.getUnlocks(playerId)
	})

describe('Achievements', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect(
		'unlocks first-win and beat-beginner-bot for a signed-in winner against a Beginner bot',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() => seedUser(fixture, 'alice', 'alice'))
				const out = yield* writeAndEvaluate(baseResult(), baseConfig())
				const unlocked = out.perTribe.get('barbarians') ?? []
				expect(unlocked).toContain('first-win')
				expect(unlocked).toContain('beat-beginner-bot')
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('skips evaluation for guests with no user row', () =>
		Effect.gen(function* () {
			const out = yield* writeAndEvaluate(baseResult(), baseConfig())
			expect(out.perTribe.size).toBe(0)
			const stored = yield* getUnlocks('alice')
			expect(stored).toEqual([])
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'is idempotent: re-running evaluation does not duplicate rows',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() => seedUser(fixture, 'alice', 'alice'))
				yield* writeAndEvaluate(baseResult(), baseConfig())
				// Second run with the same result is a no-op.
				const a = yield* Achievements
				const second = yield* a.evaluateAndPersist({
					result: baseResult(),
					config: baseConfig()
				})
				// The second run sees prior unlocks and returns no new ones.
				expect(second.perTribe.size).toBe(0)
				expect(
					yield* Effect.promise(() => fixture.countRows('achievementUnlocks'))
				).toBe(2)
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('does not unlock first-win on a loss', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() => seedUser(fixture, 'alice', 'alice'))
			const out = yield* writeAndEvaluate(
				baseResult({ winner: 'rogues' }),
				baseConfig()
			)
			expect(out.perTribe.size).toBe(0)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('does not unlock first-win on the second win', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() => seedUser(fixture, 'alice', 'alice'))
			yield* writeAndEvaluate(baseResult(), baseConfig())
			// Second match: prior win exists, so first-win must not fire again.
			const out = yield* writeAndEvaluate(
				baseResult({
					matchId: mid('match-2'),
					completedAt: '2026-04-02T00:00:00Z'
				}),
				baseConfig()
			)
			const unlocked = out.perTribe.get('barbarians') ?? []
			expect(unlocked).not.toContain('first-win')
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'returns stored unlocks via getUnlocks sorted by unlockedAt then id',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() => seedUser(fixture, 'alice', 'alice'))
				yield* writeAndEvaluate(baseResult(), baseConfig())
				const stored = yield* getUnlocks('alice')
				expect(stored.length).toBeGreaterThanOrEqual(2)
				// Same timestamp → sorted by achievementId asc.
				for (let i = 1; i < stored.length; i++) {
					const prev = stored[i - 1]
					const curr = stored[i]
					assert(prev !== undefined && curr !== undefined)
					const ordered =
						prev.unlockedAt !== curr.unlockedAt ||
						prev.achievementId.localeCompare(curr.achievementId) < 0
					expect(ordered).toBe(true)
				}
			}).pipe(Effect.provide(layerFor(fixture)))
	)
})
