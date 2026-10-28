export type TurnTimerTone = 'normal' | 'warning' | 'critical'

export interface TurnTimerThresholds {
	warning: number
	critical: number
}

const defaultThresholds: TurnTimerThresholds = {
	warning: 0.3,
	critical: 0.1
}

export interface RingProgress {
	fraction: number
	dashOffset: number
	tone: TurnTimerTone
}

/**
 * Stroke-dash math for the turn timer. pathLength is normalised to 100 so
 * dashOffset is the percentage of path that is hidden from the starting point.
 */
export function computeRingProgress(args: {
	secondsRemaining: number
	totalSeconds: number
	thresholds?: TurnTimerThresholds | undefined
}): RingProgress {
	const thresholds = args.thresholds ?? defaultThresholds
	const totalSeconds = Math.max(args.totalSeconds, 0)
	const secondsRemaining = Math.max(
		Math.min(args.secondsRemaining, totalSeconds),
		0
	)
	const fraction = totalSeconds === 0 ? 0 : secondsRemaining / totalSeconds
	const dashOffset = 100 * (1 - fraction)
	let tone: TurnTimerTone = 'normal'
	if (fraction <= thresholds.critical) {
		tone = 'critical'
	} else if (fraction <= thresholds.warning) {
		tone = 'warning'
	}
	return { fraction, dashOffset, tone }
}

export function formatSeconds(seconds: number): string {
	const rounded = Math.max(0, Math.ceil(seconds))
	if (rounded < 60) {
		return `${rounded}s`
	}
	const m = Math.floor(rounded / 60)
	const s = rounded % 60
	return `${m}:${String(s).padStart(2, '0')}`
}
