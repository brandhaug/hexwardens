/**
 * Deterministic per-tile variation helpers.
 *
 * The board renderer needs stable pseudo-random rotation, jitter, and timing
 * phases that survive React re-renders. Three callers — fog puff cluster
 * placement, obstacle mesh rotation, and water ripple drops — all need an
 * RNG seeded from a tile's world position.
 */

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d_2b_79_f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
	}
}

export function tileSeedFromWorld(x: number, z: number): number {
	const seed =
		Math.abs(
			(Math.round(x * 1000) * 374_761_393 +
				Math.round(z * 1000) * 668_265_263) |
				0
		) || 1
	return seed
}

export function darkenHex(hex: string, factor: number): string {
	const clean = hex.replace('#', '')
	const r = Number.parseInt(clean.slice(0, 2), 16)
	const g = Number.parseInt(clean.slice(2, 4), 16)
	const b = Number.parseInt(clean.slice(4, 6), 16)
	const f = Math.max(0, Math.min(1, factor))
	const dr = Math.round(r * f)
	const dg = Math.round(g * f)
	const db = Math.round(b * f)
	return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}
