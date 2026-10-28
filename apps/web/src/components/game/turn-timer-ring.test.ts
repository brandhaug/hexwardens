import { describe, expect, it } from 'vite-plus/test'
import {
	computeRingProgress,
	formatSeconds
} from '@/components/game/turn-timer-math'

describe('computeRingProgress', () => {
	it('returns full ring + normal tone at full time', () => {
		const result = computeRingProgress({
			secondsRemaining: 60,
			totalSeconds: 60
		})
		expect(result.fraction).toBe(1)
		expect(result.dashOffset).toBe(0)
		expect(result.tone).toBe('normal')
	})

	it('returns empty ring + critical tone at zero', () => {
		const result = computeRingProgress({
			secondsRemaining: 0,
			totalSeconds: 60
		})
		expect(result.fraction).toBe(0)
		expect(result.dashOffset).toBe(100)
		expect(result.tone).toBe('critical')
	})

	it('flips to warning at the 30 % threshold', () => {
		const justAbove = computeRingProgress({
			secondsRemaining: 18.01,
			totalSeconds: 60
		})
		const atThreshold = computeRingProgress({
			secondsRemaining: 18,
			totalSeconds: 60
		})
		expect(justAbove.tone).toBe('normal')
		expect(atThreshold.tone).toBe('warning')
	})

	it('flips to critical at the 10 % threshold', () => {
		const justAbove = computeRingProgress({
			secondsRemaining: 6.01,
			totalSeconds: 60
		})
		const atThreshold = computeRingProgress({
			secondsRemaining: 6,
			totalSeconds: 60
		})
		expect(justAbove.tone).toBe('warning')
		expect(atThreshold.tone).toBe('critical')
	})

	it('honours custom thresholds', () => {
		const result = computeRingProgress({
			secondsRemaining: 40,
			totalSeconds: 60,
			thresholds: { warning: 0.8, critical: 0.5 }
		})
		// 40/60 ≈ 0.67 → below 0.8 warning, above 0.5 critical
		expect(result.tone).toBe('warning')
	})

	it('clamps secondsRemaining to [0, totalSeconds]', () => {
		const over = computeRingProgress({
			secondsRemaining: 999,
			totalSeconds: 60
		})
		const under = computeRingProgress({
			secondsRemaining: -5,
			totalSeconds: 60
		})
		expect(over.fraction).toBe(1)
		expect(over.dashOffset).toBe(0)
		expect(under.fraction).toBe(0)
		expect(under.dashOffset).toBe(100)
	})

	it('dashOffset scales linearly with time elapsed', () => {
		const halfway = computeRingProgress({
			secondsRemaining: 30,
			totalSeconds: 60
		})
		expect(halfway.fraction).toBeCloseTo(0.5, 5)
		expect(halfway.dashOffset).toBeCloseTo(50, 5)
	})

	it('handles zero total without dividing by zero', () => {
		const result = computeRingProgress({
			secondsRemaining: 10,
			totalSeconds: 0
		})
		expect(result.fraction).toBe(0)
		expect(result.dashOffset).toBe(100)
		expect(result.tone).toBe('critical')
	})
})

describe('formatSeconds', () => {
	it('formats sub-minute values as "Ns"', () => {
		expect(formatSeconds(0)).toBe('0s')
		expect(formatSeconds(5)).toBe('5s')
		expect(formatSeconds(59)).toBe('59s')
	})

	it('formats minute+ values as "M:SS"', () => {
		expect(formatSeconds(60)).toBe('1:00')
		expect(formatSeconds(75)).toBe('1:15')
		expect(formatSeconds(3599)).toBe('59:59')
	})

	it('rounds up fractional seconds', () => {
		expect(formatSeconds(4.1)).toBe('5s')
		expect(formatSeconds(59.9)).toBe('1:00')
	})

	it('clamps negative input to zero', () => {
		expect(formatSeconds(-10)).toBe('0s')
	})
})
