import { it } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'
import { layerFromClient } from '@hexwardens/db/effect'
import { PlayerId, Username } from '@hexwardens/game-logic/ids'
import { type CosmeticSlot } from '@hexwardens/db/schema'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { Cosmetics, CosmeticsLive, cosmeticCatalog } from './cosmetics'
import {
	createD1Fixture,
	seedMatchResults as seed,
	seedUser,
	type D1Fixture,
	type SeedMatchResultRow
} from './test/d1-fixture'

const layerFor = (fixture: D1Fixture) =>
	CosmeticsLive.pipe(Layer.provide(layerFromClient(fixture.db)))

const equip = (playerId: string, slot: CosmeticSlot, unlockId: string | null) =>
	Effect.gen(function* () {
		const cosmetics = yield* Cosmetics
		yield* cosmetics.equipCosmetic(PlayerId.make(playerId), slot, unlockId)
	})

const acknowledge = (playerId: string, unlockId: string) =>
	Effect.gen(function* () {
		const cosmetics = yield* Cosmetics
		yield* cosmetics.acknowledgeUnlock(PlayerId.make(playerId), unlockId)
	})

const getPlayerCosmetics = (username: string) =>
	Effect.gen(function* () {
		const cosmetics = yield* Cosmetics
		return yield* cosmetics.getPlayerCosmetics(Username.make(username))
	})

function buildHistory(
	playerId: string,
	username: string,
	specs: Array<{ tribe: Tribe; wins: number; losses: number }>
): SeedMatchResultRow[] {
	const rows: SeedMatchResultRow[] = []
	let counter = 0
	for (const spec of specs) {
		for (let i = 0; i < spec.wins; i++) {
			counter += 1
			rows.push({
				matchId: `${playerId}-m${counter}`,
				playerId,
				username,
				tribe: spec.tribe,
				isWinner: 1,
				isBot: 0
			})
		}
		for (let i = 0; i < spec.losses; i++) {
			counter += 1
			rows.push({
				matchId: `${playerId}-m${counter}`,
				playerId,
				username,
				tribe: spec.tribe,
				isWinner: 0,
				isBot: 0
			})
		}
	}
	return rows
}

describe('cosmetic catalog', () => {
	it('every entry has a unique id', () => {
		const ids = new Set(cosmeticCatalog.map((c) => c.id))
		expect(ids.size).toBe(cosmeticCatalog.length)
	})

	it('includes a tribe-mastery cosmetic for every tribe', () => {
		const tribes = new Set(
			cosmeticCatalog.filter((c) => c.tribe !== null).map((c) => c.tribe)
		)
		expect(tribes.size).toBe(9)
	})
})

describe('Cosmetics.getPlayerCosmetics', () => {
	let fixture: D1Fixture
	beforeEach(async () => {
		fixture = await createD1Fixture()
	})
	afterEach(async () => {
		await fixture.close()
	})

	it.effect('returns no profile for unknown username', () =>
		Effect.gen(function* () {
			const result = yield* getPlayerCosmetics('nobody')
			expect(Option.getOrNull(result)).toBeNull()
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('marks unlocks earned by overall match thresholds', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)
			// 5 matches → initiate + warrior; no wins → no banners
			yield* Effect.promise(() =>
				seed(
					fixture,
					buildHistory('a', 'alice', [
						{ tribe: 'barbarians', wins: 0, losses: 5 }
					])
				)
			)

			const result = yield* getPlayerCosmetics('alice')
			const profile = Option.getOrNull(result)
			expect(profile).not.toBeNull()
			if (profile === null) {
				throw new Error('unreachable')
			}

			const byId = new Map(profile.unlocks.map((u) => [u.id, u]))
			expect(byId.get('rank-initiate')?.unlocked).toBe(true)
			expect(byId.get('rank-warrior')?.unlocked).toBe(true)
			expect(byId.get('rank-captain')?.unlocked).toBe(false)
			expect(byId.get('banner-first-victory')?.unlocked).toBe(false)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('marks tribe mastery only for matches with that tribe', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)
			// 3 barbarians, 1 rogues
			yield* Effect.promise(() =>
				seed(
					fixture,
					buildHistory('a', 'alice', [
						{ tribe: 'barbarians', wins: 2, losses: 1 },
						{ tribe: 'rogues', wins: 1, losses: 0 }
					])
				)
			)

			const result = yield* getPlayerCosmetics('alice')
			const profile = Option.getOrNull(result)
			if (profile === null) {
				throw new Error('unreachable')
			}

			const byId = new Map(profile.unlocks.map((u) => [u.id, u]))
			expect(byId.get('tribe-barbarians-sworn')?.unlocked).toBe(true)
			expect(byId.get('tribe-rogues-sworn')?.unlocked).toBe(false)
			expect(byId.get('tribe-barbarians-champion')?.unlocked).toBe(false)
			expect(byId.get('banner-first-victory')?.unlocked).toBe(true)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('excludes bot rows from aggregates', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)
			yield* Effect.promise(() =>
				seed(fixture, [
					{
						matchId: 'real-1',
						playerId: 'a',
						username: 'alice',
						tribe: 'barbarians',
						isWinner: 1,
						isBot: 0
					},
					...Array.from({ length: 50 }, (_, i) => ({
						matchId: `bot-${i}`,
						playerId: 'a',
						username: 'alice',
						tribe: 'barbarians' as const,
						isWinner: 1 as const,
						isBot: 1 as const
					}))
				])
			)

			const result = yield* getPlayerCosmetics('alice')
			const profile = Option.getOrNull(result)
			if (profile === null) {
				throw new Error('unreachable')
			}
			const byId = new Map(profile.unlocks.map((u) => [u.id, u]))
			// Warlord requires 50 matches — bots are excluded so it must NOT be unlocked
			expect(byId.get('rank-warlord')?.unlocked).toBe(false)
			expect(byId.get('rank-initiate')?.unlocked).toBe(true)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('reports acknowledged unlocks once acknowledged', () =>
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

			yield* acknowledge('a', 'rank-initiate')
			// idempotent
			yield* acknowledge('a', 'rank-initiate')

			const result = yield* getPlayerCosmetics('alice')
			const profile = Option.getOrNull(result)
			if (profile === null) {
				throw new Error('unreachable')
			}
			const byId = new Map(profile.unlocks.map((u) => [u.id, u]))
			expect(byId.get('rank-initiate')?.acknowledged).toBe(true)
			expect(byId.get('rank-warrior')?.acknowledged).toBe(false)
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'honours equipped cosmetics that the player still has unlocked',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'a', username: 'alice' })
				)
				yield* Effect.promise(() =>
					seed(
						fixture,
						buildHistory('a', 'alice', [
							{ tribe: 'barbarians', wins: 1, losses: 0 }
						])
					)
				)

				yield* equip('a', 'banner', 'banner-first-victory')

				const result = yield* getPlayerCosmetics('alice')
				const profile = Option.getOrNull(result)
				if (profile === null) {
					throw new Error('unreachable')
				}
				expect(profile.equipped.banner).toBe('banner-first-victory')
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'ignores equipped cosmetics whose underlying unlock is not earned',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'a', username: 'alice' })
				)
				// no wins
				yield* Effect.promise(() =>
					seed(
						fixture,
						buildHistory('a', 'alice', [
							{ tribe: 'barbarians', wins: 0, losses: 1 }
						])
					)
				)

				yield* equip('a', 'banner', 'banner-tenfold')

				const result = yield* getPlayerCosmetics('alice')
				const profile = Option.getOrNull(result)
				if (profile === null) {
					throw new Error('unreachable')
				}
				expect(profile.equipped.banner).toBeUndefined()
			}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect('clears an equipped slot when given null', () =>
		Effect.gen(function* () {
			yield* Effect.promise(() =>
				seedUser(fixture, { id: 'a', username: 'alice' })
			)
			yield* Effect.promise(() =>
				seed(
					fixture,
					buildHistory('a', 'alice', [
						{ tribe: 'barbarians', wins: 1, losses: 0 }
					])
				)
			)

			yield* equip('a', 'banner', 'banner-first-victory')
			yield* equip('a', 'banner', null)

			const result = yield* getPlayerCosmetics('alice')
			const profile = Option.getOrNull(result)
			if (profile === null) {
				throw new Error('unreachable')
			}
			expect(profile.equipped.banner).toBeUndefined()
		}).pipe(Effect.provide(layerFor(fixture)))
	)

	it.effect(
		'replaces an equipped cosmetic when re-equipping the same slot',
		() =>
			Effect.gen(function* () {
				yield* Effect.promise(() =>
					seedUser(fixture, { id: 'a', username: 'alice' })
				)
				yield* Effect.promise(() =>
					seed(
						fixture,
						buildHistory('a', 'alice', [
							{ tribe: 'barbarians', wins: 1, losses: 0 }
						])
					)
				)

				yield* equip('a', 'plaque', 'rank-initiate')
				yield* equip('a', 'plaque', 'rank-initiate')

				const result = yield* getPlayerCosmetics('alice')
				const profile = Option.getOrNull(result)
				if (profile === null) {
					throw new Error('unreachable')
				}
				expect(profile.equipped.plaque).toBe('rank-initiate')
			}).pipe(Effect.provide(layerFor(fixture)))
	)
})
