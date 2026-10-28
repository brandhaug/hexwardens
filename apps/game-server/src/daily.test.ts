import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { layerFromClient } from '@hexwardens/db/effect'
import { Daily, DailyLive } from './daily'
import { createD1Fixture, seedUser, type D1Fixture } from './test/d1-fixture'

const ALICE = { id: 'user_alice', username: 'alice' }
const BOB = { id: 'user_bob', username: 'bob' }
const CHALLENGE_ID = 'capture-five-villages' as const

const layerFor = (fixture: D1Fixture) =>
	DailyLive.pipe(Layer.provide(layerFromClient(fixture.db)))

const complete = (
	user: { id: string; username: string },
	date: string,
	turns: number
) =>
	Effect.gen(function* () {
		const daily = yield* Daily
		return yield* daily.upsertCompletion({
			userId: user.id,
			username: user.username,
			dailyDate: date,
			challengeId: CHALLENGE_ID,
			turns
		})
	})

const view = (date: string, user: { id: string; username: string } | null) =>
	Effect.gen(function* () {
		const daily = yield* Daily
		return yield* daily.view(date, user)
	})

const streak = (userId: string, today: string) =>
	Effect.gen(function* () {
		const daily = yield* Daily
		return yield* daily.currentStreak(userId, today)
	})

describe('Daily.upsertCompletion', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
		await seedUser(fixture, ALICE)
		await seedUser(fixture, BOB)
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect(
		'records first completion and bumps completionCount on subsequent completions',
		() =>
			Effect.gen(function* () {
				const first = yield* complete(ALICE, '2026-05-05', 12)
				expect(first.improved).toBe(true)
				expect(first.best.bestTurns).toBe(12)
				expect(first.best.completionCount).toBe(1)

				const second = yield* complete(ALICE, '2026-05-05', 20)
				expect(second.improved).toBe(false)
				expect(second.best.bestTurns).toBe(12)
				expect(second.best.completionCount).toBe(2)
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'keeps the better turn-count when the second completion is faster',
		() =>
			Effect.gen(function* () {
				yield* complete(ALICE, '2026-05-05', 25)
				const better = yield* complete(ALICE, '2026-05-05', 10)
				expect(better.improved).toBe(true)
				expect(better.best.bestTurns).toBe(10)
				expect(better.best.completionCount).toBe(2)
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('keeps existing best when a slower completion is recorded', () =>
		Effect.gen(function* () {
			yield* complete(ALICE, '2026-05-05', 8)
			const worse = yield* complete(ALICE, '2026-05-05', 30)
			expect(worse.improved).toBe(false)
			expect(worse.best.bestTurns).toBe(8)
			expect(worse.best.completionCount).toBe(2)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('partitions results by user', () =>
		Effect.gen(function* () {
			yield* complete(ALICE, '2026-05-05', 10)
			yield* complete(BOB, '2026-05-05', 14)

			const v = yield* view('2026-05-05', ALICE)
			expect(v.entries).toHaveLength(2)
			expect(v.entries[0]?.username).toBe('alice')
			expect(v.callerBest?.bestTurns).toBe(10)
			expect(v.callerRank).toBe(1)
			expect(v.completionCount).toBe(2)
		}).pipe(Effect.provide(layerFor(fixture)))
	)
})

describe('Daily.view', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
		await seedUser(fixture, ALICE)
		await seedUser(fixture, BOB)
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect("returns today's challenge meta even when no entries exist", () =>
		Effect.gen(function* () {
			const v = yield* view('2026-05-05', ALICE)
			expect(v.date).toBe('2026-05-05')
			expect(v.challenge.challengeId).toBe('capture-five-villages')
			expect(v.challenge.target).toBe(5)
			expect(v.entries).toEqual([])
			expect(v.completionCount).toBe(0)
			expect(v.callerBest).toBeNull()
			expect(v.callerRank).toBeNull()
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('ranks same-turn completions by first completion order', () =>
		Effect.gen(function* () {
			yield* complete(ALICE, '2026-05-05', 10)
			yield* complete(BOB, '2026-05-05', 10)

			const bobView = yield* view('2026-05-05', BOB)

			expect(bobView.entries.map((entry) => entry.userId)).toEqual([
				'user_alice',
				'user_bob'
			])
			expect(bobView.callerRank).toBe(2)
		}).pipe(Effect.provide(layerFor(fixture)))
	)
})

describe('Daily.currentStreak', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
		await seedUser(fixture, ALICE)
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns 0 when the user has never played', () =>
		Effect.gen(function* () {
			const s = yield* streak(ALICE.id, '2026-05-05')
			expect(s).toBe(0)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('returns 3 for three consecutive days ending today', () =>
		Effect.gen(function* () {
			for (const date of ['2026-05-03', '2026-05-04', '2026-05-05']) {
				yield* complete(ALICE, date, 10)
			}
			const s = yield* streak(ALICE.id, '2026-05-05')
			expect(s).toBe(3)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('returns 1 for a user who played today but missed yesterday', () =>
		Effect.gen(function* () {
			yield* complete(ALICE, '2026-05-02', 10)
			yield* complete(ALICE, '2026-05-05', 10)
			const s = yield* streak(ALICE.id, '2026-05-05')
			expect(s).toBe(1)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('returns 0 for a user who played yesterday but not today', () =>
		Effect.gen(function* () {
			yield* complete(ALICE, '2026-05-04', 10)
			const s = yield* streak(ALICE.id, '2026-05-05')
			expect(s).toBe(0)
		}).pipe(Effect.provide(layerFor(fixture)))
	)
})
