import { Predicate } from 'effect'
import { DurableObject } from 'cloudflare:workers'
import { type Env } from './types'

const STORAGE_KEY = 'count'
const SINGLETON_NAME = 'main'

/**
 * Singleton presence counter — sums the live player WebSockets across the
 * Matchmaker and every Match DO. The number is a "room is alive" signal, not
 * a metric, so the counter is a plain scalar with a clamp at zero. Drift on
 * the order of a few units is acceptable; in practice it self-heals as
 * connections turn over.
 */
export class Presence extends DurableObject<Env> {
	increment(): Promise<number> {
		const next = this.read() + 1
		this.write(next)
		return Promise.resolve(next)
	}

	decrement(): Promise<number> {
		const next = Math.max(0, this.read() - 1)
		this.write(next)
		return Promise.resolve(next)
	}

	count(): Promise<number> {
		return Promise.resolve(this.read())
	}

	private read(): number {
		const raw = this.ctx.storage.kv.get(STORAGE_KEY)
		return Predicate.isNumber(raw) ? raw : 0
	}

	private write(value: number): void {
		this.ctx.storage.kv.put(STORAGE_KEY, value)
	}
}

function singleton(env: Env) {
	return env.PRESENCE.get(env.PRESENCE.idFromName(SINGLETON_NAME))
}

export function presenceIncrement(ctx: DurableObjectState, env: Env): void {
	ctx.waitUntil(singleton(env).increment())
}

/**
 * Raw decrement. Do not call this from WebSocket handlers directly — release
 * idempotency (the flip-`presenceCounted`-then-decrement ordering) is owned
 * by `createConnectionLifecycle().release` in `ws-connection.ts`.
 */
export function presenceDecrement(ctx: DurableObjectState, env: Env): void {
	ctx.waitUntil(singleton(env).decrement())
}

export async function presenceCount(env: Env): Promise<number> {
	return singleton(env).count()
}
