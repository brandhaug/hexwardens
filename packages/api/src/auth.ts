import { Context, Schema } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

export type SessionUser = {
	readonly userId: string
	readonly username: string
	readonly isGuest: boolean
}

export const GameTokenPayloadSchema = Schema.Struct({
	userId: Schema.String,
	username: Schema.String,
	exp: Schema.Finite
})

export type GameTokenPayload = typeof GameTokenPayloadSchema.Type

export class SessionContext extends Context.Service<
	SessionContext,
	SessionUser
>()('@hexwardens/api/SessionContext') {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	'Unauthorized',
	{
		message: Schema.String
	},
	{ httpApiStatus: 401 }
) {}

export class SessionAuth extends HttpApiMiddleware.Service<
	SessionAuth,
	{ provides: SessionContext }
>()('SessionAuth', {
	error: Unauthorized,
	security: { bearer: HttpApiSecurity.bearer }
}) {}
