/*
 * Native-feel haptic feedback.
 *
 * Mobile games confirm taps with a sub-perceptual buzz. We do the same via
 * the Vibration API on devices that support it. iOS Safari does not — there
 * is no fallback short of a native PWA wrapper, so the calls quietly no-op.
 *
 * Patterns are short by design: long buzzes feel like an error notification,
 * not a button press. The harshest signal is reserved for the End-Turn
 * commit so it stands out from incremental taps.
 */

type HapticPattern =
	/** Single short tap — every tile action, menu navigation. */
	| 'tap'
	/** Two-beat pulse — irreversible commit (End Turn, Start Match). */
	| 'commit'
	/** Triple pulse — error / denied action. */
	| 'error'

const PATTERNS: Record<HapticPattern, number | number[]> = {
	tap: 8,
	commit: [12, 30, 18],
	error: [10, 40, 10, 40, 10]
}

const prefersReducedMotion = (): boolean => {
	if (typeof window === 'undefined') {
		return false
	}
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const canVibrate = (): boolean => {
	if (typeof navigator === 'undefined') {
		return false
	}
	return 'vibrate' in navigator
}

export const haptic = (pattern: HapticPattern = 'tap'): void => {
	if (!canVibrate() || prefersReducedMotion()) {
		return
	}
	navigator.vibrate(PATTERNS[pattern])
}
