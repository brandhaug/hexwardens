import { GameTokenPayloadSchema, type GameTokenPayload } from '@hexwardens/api'
import { Effect, Redacted, Result, Schema } from 'effect'

const decodeHeader = Schema.decodeUnknownResult(
	Schema.Struct({
		alg: Schema.Literal('HS256'),
		typ: Schema.Literal('JWT')
	})
)

const decodeGameTokenPayload = Schema.decodeUnknownResult(
	GameTokenPayloadSchema
)

class AuthError extends Schema.TaggedError<AuthError>()('AuthError', {
	reason: Schema.Literals([
		'invalid_format',
		'invalid_signature',
		'expired',
		'malformed_payload'
	]),
	message: Schema.String
}) {}

export const verifyGameToken = (
	token: string,
	secret: Redacted.Redacted
): Effect.Effect<GameTokenPayload, AuthError> =>
	Effect.gen(function* () {
		const segments = token.split('.')
		const [headerB64, payloadB64, signatureB64] = segments
		if (
			segments.length !== 3 ||
			!headerB64 ||
			!payloadB64 ||
			!signatureB64 ||
			segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
		) {
			return yield* new AuthError({
				reason: 'invalid_format',
				message: 'JWT does not contain three dot-separated segments'
			})
		}

		const header = yield* Effect.try({
			try: () =>
				JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))),
			catch: () =>
				new AuthError({
					reason: 'invalid_format',
					message: 'Invalid JWT header'
				})
		})
		if (Result.isFailure(decodeHeader(header))) {
			return yield* new AuthError({
				reason: 'invalid_format',
				message: 'Unsupported JWT header'
			})
		}
		const signature = yield* Effect.try({
			try: () => base64UrlDecode(signatureB64),
			catch: () =>
				new AuthError({
					reason: 'invalid_format',
					message: 'Invalid JWT signature encoding'
				})
		})

		const key = yield* Effect.tryPromise({
			try: () =>
				crypto.subtle.importKey(
					'raw',
					new TextEncoder().encode(Redacted.value(secret)),
					{ name: 'HMAC', hash: 'SHA-256' },
					false,
					['verify']
				),
			catch: () =>
				new AuthError({
					reason: 'invalid_format',
					message: 'Unable to verify game token'
				})
		})

		const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

		const valid = yield* Effect.tryPromise({
			try: () => crypto.subtle.verify('HMAC', key, signature, data),
			catch: () =>
				new AuthError({
					reason: 'invalid_signature',
					message: 'Unable to verify game token'
				})
		})
		if (!valid) {
			return yield* new AuthError({
				reason: 'invalid_signature',
				message: 'HMAC-SHA256 signature verification failed'
			})
		}

		const rawPayload = yield* Effect.try({
			try: () =>
				JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))),
			catch: () =>
				new AuthError({
					reason: 'malformed_payload',
					message: 'Invalid game token payload'
				})
		})
		const decodedPayload = decodeGameTokenPayload(rawPayload)
		if (Result.isFailure(decodedPayload)) {
			return yield* new AuthError({
				reason: 'malformed_payload',
				message: 'Invalid game token claims'
			})
		}
		const payload = decodedPayload.success

		if (payload.exp <= Date.now() / 1000) {
			return yield* new AuthError({
				reason: 'expired',
				message: 'Token expiry time has passed'
			})
		}

		return payload
	})

function base64UrlDecode(str: string): Uint8Array {
	const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
	const binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}
