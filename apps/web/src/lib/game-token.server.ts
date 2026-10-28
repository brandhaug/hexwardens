// oxlint-disable-next-line import/no-unassigned-import -- Start requires this marker to reject client imports.
import '@tanstack/react-start/server-only'
import { type GameTokenPayload } from '@hexwardens/api/auth'

export type TokenSigner = {
	sign(userId: string, username: string): Promise<string>
	signGuest(): Promise<string>
}

const HEADER_B64 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'

let cachedSecret: string | null = null
let cachedKey: Promise<CryptoKey> | null = null

function getSigningKey(secret: string): Promise<CryptoKey> {
	if (cachedSecret === secret && cachedKey !== null) {
		return cachedKey
	}
	cachedSecret = secret
	cachedKey = crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	return cachedKey
}

// Uniform sample in [1000, 9999] via rejection sampling. 65536 % 9000 != 0,
// so naive `u16 % 9000` is biased toward the low end.
const GUEST_RANGE = 9000
const GUEST_SAMPLE_LIMIT = 65_536 - (65_536 % GUEST_RANGE)

function pickGuestNumber(): number {
	const bytes = new Uint8Array(2)
	let n: number
	do {
		crypto.getRandomValues(bytes)
		n = new DataView(bytes.buffer).getUint16(0)
	} while (n >= GUEST_SAMPLE_LIMIT)
	return (n % GUEST_RANGE) + 1000
}

// Game tokens must outlive the longest plausible play session: the client
// reconnects with the token it was minted with (no refresh flow), so a 1h
// expiry would 401 reconnects mid-match in long sessions. 12h covers any
// realistic session while still bounding leaked-token exposure.
const TOKEN_TTL_SECONDS = 12 * 60 * 60

export function createTokenSigner(secret: string): TokenSigner {
	async function sign(userId: string, username: string): Promise<string> {
		const payload: GameTokenPayload = {
			userId,
			username,
			exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
		}

		const payloadB64 = base64UrlEncode(JSON.stringify(payload))
		const signingInput = `${HEADER_B64}.${payloadB64}`

		const signature = await crypto.subtle.sign(
			'HMAC',
			await getSigningKey(secret),
			new TextEncoder().encode(signingInput)
		)

		return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
	}

	async function signGuest(): Promise<string> {
		const guestId = `guest_${crypto.randomUUID().slice(0, 8)}`
		return sign(guestId, `Guest #${pickGuestNumber()}`)
	}

	return { sign, signGuest }
}

function base64UrlEncode(str: string): string {
	return base64UrlEncodeBytes(new TextEncoder().encode(str))
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
	let binary = ''
	for (const b of bytes) {
		binary += String.fromCharCode(b)
	}
	return btoa(binary)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '')
}
