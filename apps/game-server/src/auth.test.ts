import { it } from '@effect/vitest'
import { Effect, Redacted, type Schema } from 'effect'
import { verifyGameToken } from './auth'

const secretValue = 'test-secret-0123456789abcdef'
const secret = Redacted.make(secretValue)

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '')
}

function encodeSegment(value: Schema.Json): string {
	return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)))
}

async function signSegments(
	headerAndPayload: string,
	signingSecret: string
): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(signingSecret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(headerAndPayload)
	)
	return base64UrlEncode(new Uint8Array(signature))
}

async function mintToken(
	payload: Schema.Json,
	signingSecret: string = secretValue
): Promise<string> {
	const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
	const body = encodeSegment(payload)
	const signature = await signSegments(`${header}.${body}`, signingSecret)
	return `${header}.${body}.${signature}`
}

const validPayload = () => ({
	userId: 'user-1',
	username: 'alice',
	exp: Math.floor(Date.now() / 1000) + 600
})

describe('verifyGameToken', () => {
	it.effect('rejects extra JWT segments', () =>
		Effect.gen(function* () {
			const token = yield* Effect.promise(() => mintToken(validPayload()))
			const error = yield* Effect.flip(
				verifyGameToken(`${token}.extra`, secret)
			)
			expect(error.reason).toBe('invalid_format')
		})
	)

	it.effect('turns invalid base64 into a typed refusal', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(verifyGameToken('e30.e30.%', secret))
			expect(error.reason).toBe('invalid_format')
		})
	)

	it.effect('rejects a signed unsupported JWT header', () =>
		Effect.gen(function* () {
			const input = `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${encodeSegment(validPayload())}`
			const signature = yield* Effect.promise(() =>
				signSegments(input, secretValue)
			)
			const error = yield* Effect.flip(
				verifyGameToken(`${input}.${signature}`, secret)
			)
			expect(error.reason).toBe('invalid_format')
		})
	)

	it.effect('accepts a freshly minted token', () =>
		Effect.gen(function* () {
			const token = yield* Effect.promise(() => mintToken(validPayload()))
			const payload = yield* verifyGameToken(token, secret)
			expect(payload.userId).toBe('user-1')
			expect(payload.username).toBe('alice')
		})
	)

	it.effect('rejects a token without three segments', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(verifyGameToken('not-a-jwt', secret))
			expect(error._tag).toBe('AuthError')
			expect(error.reason).toBe('invalid_format')
		})
	)

	it.effect('rejects a token signed with a different secret', () =>
		Effect.gen(function* () {
			const token = yield* Effect.promise(() =>
				mintToken(validPayload(), 'some-other-secret-its-wrong')
			)
			const error = yield* Effect.flip(verifyGameToken(token, secret))
			expect(error.reason).toBe('invalid_signature')
		})
	)

	it.effect('rejects a token whose payload was tampered with', () =>
		Effect.gen(function* () {
			const token = yield* Effect.promise(() => mintToken(validPayload()))
			const [header, , signature] = token.split('.')
			const forgedPayload = encodeSegment({
				...validPayload(),
				userId: 'user-2'
			})
			const error = yield* Effect.flip(
				verifyGameToken(`${header}.${forgedPayload}.${signature}`, secret)
			)
			expect(error.reason).toBe('invalid_signature')
		})
	)

	it.effect('rejects an expired token', () =>
		Effect.gen(function* () {
			const token = yield* Effect.promise(() =>
				mintToken({
					userId: 'user-1',
					username: 'alice',
					exp: Math.floor(Date.now() / 1000) - 60
				})
			)
			const error = yield* Effect.flip(verifyGameToken(token, secret))
			expect(error.reason).toBe('expired')
		})
	)

	it.effect('rejects a validly signed token with a malformed payload', () =>
		Effect.gen(function* () {
			const token = yield* Effect.promise(() =>
				mintToken({ userId: 42, username: 'alice' })
			)
			const error = yield* Effect.flip(verifyGameToken(token, secret))
			expect(error.reason).toBe('malformed_payload')
		})
	)
})
