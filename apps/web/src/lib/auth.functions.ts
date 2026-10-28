import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Effect, Predicate, Schema } from 'effect'
import { Auth } from '@/lib/auth.server'
import { authFormRequest, authFailureMessage } from '@/lib/auth-form-request'
import { ServerContextTag } from '@/lib/server-context-tag'
import { runWithServerContext } from '@/lib/server-context'

const SignInBody = Schema.Struct({
	username: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
	password: Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
})

const SignUpBody = Schema.Struct({
	username: Schema.String.pipe(Schema.check(Schema.isMinLength(3))),
	email: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
	password: Schema.String.pipe(Schema.check(Schema.isMinLength(8)))
})

const decodeSignIn = Schema.decodeUnknownSync(SignInBody)
const decodeSignUp = Schema.decodeUnknownSync(SignUpBody)

class AuthError extends Schema.TaggedError<AuthError>()(
	'AuthError',
	{
		message: Schema.String
	},
	{ httpApiStatus: 400 }
) {}

function readField(form: FormData, name: string): string {
	const raw = form.get(name)
	return Predicate.isString(raw) ? raw : ''
}

function redirectResponse(location: string, setCookie?: Headers): Response {
	const headers = new Headers({ location })
	if (setCookie) {
		for (const cookie of setCookie.getSetCookie()) {
			headers.append('set-cookie', cookie)
		}
	}
	return new Response(null, { status: 303, headers })
}

function errorRedirect(message: string): Response {
	const params = new URLSearchParams({ authError: message })
	return redirectResponse(`/sign-in?${params.toString()}`)
}

// Forward form credentials through the HTTP handler so Better Auth runs its
// origin checks and rate limiter with the original request identity.
const signInEffect = Effect.fn('Auth.signIn')(function* (
	data: typeof SignInBody.Type
) {
	const auth = yield* Auth.Tag
	const ctx = yield* ServerContextTag
	const response = yield* Effect.tryPromise({
		try: () =>
			auth.instance.handler(
				authFormRequest(ctx.request, '/sign-in/username', data)
			),
		catch: () => new AuthError({ message: 'Sign in failed' })
	})
	if (!response.ok) {
		const message = authFailureMessage(response, 'Sign in failed')
		return yield* new AuthError({ message })
	}
	return redirectResponse('/', response.headers)
})

const signUpEffect = Effect.fn('Auth.signUp')(function* (
	data: typeof SignUpBody.Type
) {
	const auth = yield* Auth.Tag
	const ctx = yield* ServerContextTag
	const response = yield* Effect.tryPromise({
		try: () =>
			auth.instance.handler(
				authFormRequest(ctx.request, '/sign-up/email', {
					name: data.username,
					username: data.username,
					email: data.email,
					password: data.password
				})
			),
		catch: () => new AuthError({ message: 'Sign up failed' })
	})
	if (!response.ok) {
		const message = authFailureMessage(response, 'Sign up failed')
		return yield* new AuthError({ message })
	}
	return redirectResponse('/', response.headers)
})

export const signInAction = createServerFn({ method: 'POST' })
	.validator((data: FormData) =>
		decodeSignIn({
			username: readField(data, 'username'),
			password: readField(data, 'password')
		})
	)
	.handler(({ data }): Promise<Response> =>
		runWithServerContext(
			getRequest(),
			signInEffect(data).pipe(
				Effect.catchTag(['AuthError'], (err) =>
					Effect.succeed(errorRedirect(err.message))
				)
			)
		)
	)

export const signUpAction = createServerFn({ method: 'POST' })
	.validator((data: FormData) =>
		decodeSignUp({
			username: readField(data, 'username'),
			email: readField(data, 'email'),
			password: readField(data, 'password')
		})
	)
	.handler(({ data }): Promise<Response> =>
		runWithServerContext(
			getRequest(),
			signUpEffect(data).pipe(
				Effect.catchTag(['AuthError'], (err) =>
					Effect.succeed(errorRedirect(err.message))
				)
			)
		)
	)
