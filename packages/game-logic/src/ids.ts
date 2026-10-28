import { Schema } from 'effect'

export const PlayerId = Schema.NonEmptyString.pipe(
	Schema.brand('@hexwardens/PlayerId')
)
export type PlayerId = Schema.Schema.Type<typeof PlayerId>

export const MatchId = Schema.NonEmptyString.pipe(
	Schema.brand('@hexwardens/MatchId')
)
export type MatchId = Schema.Schema.Type<typeof MatchId>

export const Username = Schema.NonEmptyString.pipe(
	Schema.brand('@hexwardens/Username')
)
export type Username = Schema.Schema.Type<typeof Username>
