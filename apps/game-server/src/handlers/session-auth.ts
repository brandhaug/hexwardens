import {
	SessionAuth,
	SessionContext,
	Unauthorized,
	type GameTokenPayload,
	type SessionUser
} from '@hexwardens/api'
import { Effect, Layer, Redacted } from 'effect'
import { verifyGameToken } from '../auth'
import { type Env } from '../types'

const GUEST_PREFIX = 'guest_'
export type SessionAuthEnv = Pick<Env, 'AUTH_JWT_SECRET'>

const userFromPayload = (payload: GameTokenPayload): SessionUser => ({
	userId: payload.userId,
	username: payload.username,
	isGuest: payload.userId.startsWith(GUEST_PREFIX)
})

export const sessionAuthLive = (
	env: SessionAuthEnv
): Layer.Layer<SessionAuth> =>
	Layer.succeed(SessionAuth, {
		bearer: (httpEffect, { credential }) =>
			verifyGameToken(
				Redacted.value(credential),
				Redacted.make(env.AUTH_JWT_SECRET)
			).pipe(
				Effect.map(userFromPayload),
				Effect.catchTag('AuthError', (err) =>
					Effect.fail(new Unauthorized({ message: err.message }))
				),
				Effect.flatMap((user) =>
					Effect.provideService(httpEffect, SessionContext, user)
				)
			)
	})
