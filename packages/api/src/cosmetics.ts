import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { cosmeticSlots } from '@hexwardens/db/schema'
import { tribes } from '@hexwardens/game-logic/domains/tribe'
import { InternalError, PlayerNotFoundError } from './errors.ts'

export const CosmeticSlotSchema = Schema.Literals(cosmeticSlots)
const TribeOrNull = Schema.NullOr(Schema.Literals(tribes))

export const CosmeticUnlock = Schema.Struct({
	id: Schema.String,
	slot: CosmeticSlotSchema,
	name: Schema.String,
	description: Schema.String,
	tribe: TribeOrNull,
	unlocked: Schema.Boolean,
	acknowledged: Schema.Boolean
})

export const EquippedCosmetics = Schema.Struct({
	banner: Schema.optional(Schema.String),
	plaque: Schema.optional(Schema.String),
	badge: Schema.optional(Schema.String)
})

export const PlayerCosmeticsResponse = Schema.Struct({
	username: Schema.String,
	playerId: Schema.String,
	unlocks: Schema.Array(CosmeticUnlock),
	equipped: EquippedCosmetics
})

export type CosmeticSlot = typeof CosmeticSlotSchema.Type
export type CosmeticUnlock = typeof CosmeticUnlock.Type
export type EquippedCosmetics = typeof EquippedCosmetics.Type
export type PlayerCosmeticsResponse = typeof PlayerCosmeticsResponse.Type

export const CosmeticsApi = HttpApiGroup.make('cosmetics').add(
	HttpApiEndpoint.get('get', '/cosmetics/:username', {
		params: Schema.Struct({ username: Schema.String }),
		success: PlayerCosmeticsResponse,
		error: [InternalError, PlayerNotFoundError]
	})
)
