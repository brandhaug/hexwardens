import { constVoid } from 'effect/Function'
import { Predicate } from 'effect'
/**
 * Wraps `window.matchMedia('(prefers-reduced-motion: reduce)')` so that
 * components can subscribe to the user's motion preference without each
 * one re-implementing the listener dance, and so SSR builds don't crash
 * on `window.matchMedia`.
 *
 * The PRD calls this out as a hard constraint: feedback must respect
 * `prefers-reduced-motion`. We expose two pieces of state:
 *
 *   - `prefersReducedMotion(): boolean` — synchronous read for renderers
 *   - `subscribeReducedMotion(listener): () => void` — change subscription
 *
 * Both are safe on the server (return `false`, no-op subscribe).
 */

const QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
	if (
		typeof window === 'undefined' ||
		!Predicate.isFunction(window.matchMedia)
	) {
		return false
	}
	return window.matchMedia(QUERY).matches
}

export function subscribeReducedMotion(
	listener: (prefersReduced: boolean) => void
): () => void {
	if (
		typeof window === 'undefined' ||
		!Predicate.isFunction(window.matchMedia)
	) {
		return constVoid
	}
	const mql = window.matchMedia(QUERY)
	const handler = (event: MediaQueryListEvent) => listener(event.matches)
	mql.addEventListener('change', handler)
	return () => mql.removeEventListener('change', handler)
}

/**
 * Animation duration in milliseconds for tile-anchored callouts.
 *
 * The PRD allows ~250–350ms for unit movement and asks for transform/opacity
 * over noisy particles. When reduced motion is requested we cap the budget
 * tight enough that the callout still registers as feedback but reads as a
 * static label rather than a flourish.
 */
export const FULL_MOTION_CALLOUT_DURATION_MS = 900
export const REDUCED_MOTION_CALLOUT_DURATION_MS = 200

export function calloutDurationMs(prefersReduced: boolean): number {
	return prefersReduced
		? REDUCED_MOTION_CALLOUT_DURATION_MS
		: FULL_MOTION_CALLOUT_DURATION_MS
}

/**
 * Display window for the turn banner ("Turn 12 — Your Move", capital
 * captures). Long enough to read at a glance mid-match, short enough that
 * a queued second announcement never feels backed up. Pairs with the
 * `.animate-moment-banner` keyframe duration in `index.css`.
 */
export const FULL_MOTION_BANNER_DURATION_MS = 2200
export const REDUCED_MOTION_BANNER_DURATION_MS = 1200

export function bannerDurationMs(prefersReduced: boolean): number {
	return prefersReduced
		? REDUCED_MOTION_BANNER_DURATION_MS
		: FULL_MOTION_BANNER_DURATION_MS
}
