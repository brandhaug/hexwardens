import { Context, Effect, Layer, Option, Schema } from 'effect'
import { and, count, eq, sql } from 'drizzle-orm'
import {
	isTribe,
	tribes,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import { Database, query, type DatabaseError } from '@hexwardens/db/effect'
import { PlayerId, type Username } from '@hexwardens/game-logic/ids'
import {
	type CosmeticUnlock as CosmeticUnlockDto,
	type EquippedCosmetics as EquippedCosmeticsDto,
	type PlayerCosmeticsResponse
} from '@hexwardens/api/cosmetics'
import {
	cosmeticAcknowledgements,
	cosmeticEquips,
	cosmeticSlots,
	playerMatchResults,
	user,
	type CosmeticSlot
} from '@hexwardens/db/schema'

/**
 * Cosmetic catalog. Pure data — every entry is a stable, content-addressed
 * unlock id with eligibility rules expressed as predicates over a player's
 * aggregated match history.
 *
 * Cosmetics are profile-only. They MUST NOT travel into match dispatch,
 * combat, fog-of-war, or any code in `packages/game-logic`. Adding gameplay
 * effects here is a regression — the PRD explicitly prohibits it.
 */

const isCosmeticSlot = Schema.is(Schema.Literals(cosmeticSlots))

type Aggregates = {
	readonly matches: number
	readonly wins: number
	readonly tribe: Record<Tribe, { matches: number; wins: number }>
}

export type CosmeticDefinition = {
	readonly id: string
	readonly slot: CosmeticSlot
	readonly name: string
	readonly description: string
	readonly tribe: Tribe | null
	readonly satisfied: (aggregates: Aggregates) => boolean
}

type TribeAggregates = Record<Tribe, { matches: number; wins: number }>

const emptyTribeAggregates = (): TribeAggregates => ({
	barbarians: { matches: 0, wins: 0 },
	rogues: { matches: 0, wins: 0 },
	druids: { matches: 0, wins: 0 },
	orcs: { matches: 0, wins: 0 },
	wraiths: { matches: 0, wins: 0 },
	engineers: { matches: 0, wins: 0 },
	templars: { matches: 0, wins: 0 },
	skeletons: { matches: 0, wins: 0 },
	frostkin: { matches: 0, wins: 0 }
})

// --- Catalog ---------------------------------------------------------------

const RANK_THRESHOLDS: ReadonlyArray<{
	id: string
	name: string
	description: string
	matches: number
}> = [
	{
		id: 'rank-initiate',
		name: 'Initiate',
		description: 'Take the field for your first campaign.',
		matches: 1
	},
	{
		id: 'rank-warrior',
		name: 'Warrior',
		description: 'Complete five campaigns.',
		matches: 5
	},
	{
		id: 'rank-captain',
		name: 'Captain',
		description: 'Complete fifteen campaigns.',
		matches: 15
	},
	{
		id: 'rank-warlord',
		name: 'Warlord',
		description: 'Complete fifty campaigns.',
		matches: 50
	}
]

const TRIBE_MASTERY_TIERS: ReadonlyArray<{
	suffix: string
	tierName: string
	matches: number
}> = [
	{ suffix: 'sworn', tierName: 'Sworn', matches: 3 },
	{ suffix: 'champion', tierName: 'Champion', matches: 10 },
	{ suffix: 'legend', tierName: 'Legend', matches: 25 }
]

const VICTORY_THRESHOLDS: ReadonlyArray<{
	id: string
	name: string
	description: string
	wins: number
}> = [
	{
		id: 'banner-first-victory',
		name: 'First Victory',
		description: 'Win your first match.',
		wins: 1
	},
	{
		id: 'banner-tenfold',
		name: 'Tenfold Banner',
		description: 'Win ten matches.',
		wins: 10
	},
	{
		id: 'banner-conqueror',
		name: "Conqueror's Banner",
		description: 'Win twenty-five matches.',
		wins: 25
	}
]

export const cosmeticCatalog: ReadonlyArray<CosmeticDefinition> = [
	...RANK_THRESHOLDS.map<CosmeticDefinition>((tier) => ({
		id: tier.id,
		slot: 'plaque',
		name: tier.name,
		description: tier.description,
		tribe: null,
		satisfied: (aggregates) => aggregates.matches >= tier.matches
	})),
	...VICTORY_THRESHOLDS.map<CosmeticDefinition>((tier) => ({
		id: tier.id,
		slot: 'banner',
		name: tier.name,
		description: tier.description,
		tribe: null,
		satisfied: (aggregates) => aggregates.wins >= tier.wins
	})),
	...tribes.flatMap<CosmeticDefinition>((tribe) =>
		TRIBE_MASTERY_TIERS.map<CosmeticDefinition>((tier) => ({
			id: `tribe-${tribe}-${tier.suffix}`,
			slot: 'badge',
			name: `${tier.tierName} of the ${tribeDisplayName(tribe)}`,
			description: `Complete ${tier.matches} matches as the ${tribeDisplayName(tribe)}.`,
			tribe,
			satisfied: (aggregates) => aggregates.tribe[tribe].matches >= tier.matches
		}))
	)
]

function tribeDisplayName(tribe: Tribe): string {
	return tribe.charAt(0).toUpperCase() + tribe.slice(1)
}

// --- Evaluator -------------------------------------------------------------

export type CosmeticUnlock = CosmeticUnlockDto

export type EquippedCosmetics = EquippedCosmeticsDto

export type PlayerCosmetics = Omit<
	PlayerCosmeticsResponse,
	'username' | 'playerId'
> & {
	readonly username: Username
	readonly playerId: PlayerId
}

function evaluateUnlocks(
	aggregates: Aggregates,
	acknowledged: ReadonlySet<string>
): ReadonlyArray<CosmeticUnlock> {
	return cosmeticCatalog.map((definition) => ({
		id: definition.id,
		slot: definition.slot,
		name: definition.name,
		description: definition.description,
		tribe: definition.tribe,
		unlocked: definition.satisfied(aggregates),
		acknowledged: acknowledged.has(definition.id)
	}))
}

// --- Service ---------------------------------------------------------------

type CosmeticsService = {
	readonly getPlayerCosmetics: (
		username: Username
	) => Effect.Effect<Option.Option<PlayerCosmetics>, DatabaseError>
	readonly acknowledgeUnlock: (
		playerId: PlayerId,
		unlockId: string
	) => Effect.Effect<void, DatabaseError>
	readonly equipCosmetic: (
		playerId: PlayerId,
		slot: CosmeticSlot,
		unlockId: string | null
	) => Effect.Effect<void, DatabaseError>
}

export class Cosmetics extends Context.Service<Cosmetics, CosmeticsService>()(
	'Cosmetics'
) {}

export const CosmeticsLive: Layer.Layer<Cosmetics, never, Database> =
	Layer.effect(
		Cosmetics,
		Effect.gen(function* () {
			const database = yield* Database
			const runQuery = <A>(
				effect: Effect.Effect<A, DatabaseError, Database>
			): Effect.Effect<A, DatabaseError> =>
				effect.pipe(Effect.provideService(Database, database))

			const getPlayerCosmetics = Effect.fn('Cosmetics.getPlayerCosmetics')(
				function* (username: Username) {
					const userRow = yield* runQuery(
						query('cosmetics.user', (db) =>
							db
								.select({ id: user.id, username: user.username })
								.from(user)
								.where(eq(user.username, username))
								.limit(1)
								.get()
						)
					)
					if (!userRow?.username) {
						return Option.none<PlayerCosmetics>()
					}

					const playerId = userRow.id

					const filter = and(
						eq(playerMatchResults.playerId, playerId),
						eq(playerMatchResults.isBot, false)
					)

					const [overallRow, tribeRows, ackRows, equipRows] = yield* runQuery(
						query('cosmetics.aggregates', (db) =>
							Promise.all([
								db
									.select({
										wins: sql<number>`SUM(${playerMatchResults.isWinner})`.as(
											'wins'
										),
										matches: count()
									})
									.from(playerMatchResults)
									.where(filter)
									.get(),
								db
									.select({
										tribe: playerMatchResults.tribe,
										wins: sql<number>`SUM(${playerMatchResults.isWinner})`.as(
											'wins'
										),
										matches: count()
									})
									.from(playerMatchResults)
									.where(filter)
									.groupBy(playerMatchResults.tribe)
									.all(),
								db
									.select({ unlockId: cosmeticAcknowledgements.unlockId })
									.from(cosmeticAcknowledgements)
									.where(eq(cosmeticAcknowledgements.playerId, playerId))
									.all(),
								db
									.select({
										slot: cosmeticEquips.slot,
										unlockId: cosmeticEquips.unlockId
									})
									.from(cosmeticEquips)
									.where(eq(cosmeticEquips.playerId, playerId))
									.all()
							])
						)
					)

					const tribeAggregates = emptyTribeAggregates()
					for (const row of tribeRows) {
						if (!isTribe(row.tribe)) {
							continue
						}
						tribeAggregates[row.tribe] = {
							matches: row.matches,
							wins: row.wins
						}
					}

					const aggregates: Aggregates = {
						matches: overallRow?.matches ?? 0,
						wins: overallRow?.wins ?? 0,
						tribe: tribeAggregates
					}

					const acknowledged = new Set(ackRows.map((row) => row.unlockId))
					const unlocks = evaluateUnlocks(aggregates, acknowledged)

					const equipped: {
						-readonly [K in keyof EquippedCosmetics]: EquippedCosmetics[K]
					} = {}
					const unlockById = new Map(
						unlocks.map((unlock) => [unlock.id, unlock])
					)
					for (const row of equipRows) {
						if (!isCosmeticSlot(row.slot)) {
							continue
						}
						// Only honour the equip if the underlying unlock is still earned;
						// otherwise the slot is treated as empty.
						const unlock = unlockById.get(row.unlockId)
						if (unlock?.unlocked) {
							equipped[row.slot] = row.unlockId
						}
					}

					const result: PlayerCosmetics = {
						username,
						playerId: PlayerId.make(playerId),
						unlocks,
						equipped
					}
					return Option.some(result)
				}
			)

			const acknowledgeUnlock = Effect.fn('Cosmetics.acknowledgeUnlock')(
				function* (playerId: PlayerId, unlockId: string) {
					yield* runQuery(
						query('cosmetics.acknowledge', async (db) => {
							await db
								.insert(cosmeticAcknowledgements)
								.values({ playerId, unlockId })
								.onConflictDoNothing()
						})
					)
				}
			)

			const equipCosmetic = Effect.fn('Cosmetics.equipCosmetic')(function* (
				playerId: PlayerId,
				slot: CosmeticSlot,
				unlockId: string | null
			) {
				yield* runQuery(
					query('cosmetics.equip', async (db) => {
						if (unlockId === null) {
							await db
								.delete(cosmeticEquips)
								.where(
									and(
										eq(cosmeticEquips.playerId, playerId),
										eq(cosmeticEquips.slot, slot)
									)
								)
							return
						}
						await db
							.insert(cosmeticEquips)
							.values({ playerId, slot, unlockId })
							.onConflictDoUpdate({
								target: [cosmeticEquips.playerId, cosmeticEquips.slot],
								set: { unlockId }
							})
					})
				)
			})

			return { getPlayerCosmetics, acknowledgeUnlock, equipCosmetic }
		})
	)
