import { combatAnimationTiming, defeatScale } from './unit-animation-timing'

describe('combat presentation timing', () => {
	it('finishes every skeletal clip before its board override expires', () => {
		for (const timing of Object.values(combatAnimationTiming)) {
			expect(timing.clipSeconds * 1000).toBeLessThan(timing.durationMs)
		}
	})

	it('keeps a defeated piece visible for its fall, then removes it without negative scale', () => {
		expect(defeatScale(0, false)).toBe(1)
		expect(defeatScale(450, false)).toBe(1)
		expect(defeatScale(650, false)).toBeGreaterThan(0)
		expect(defeatScale(650, false)).toBeLessThan(1)
		expect(defeatScale(combatAnimationTiming.death.durationMs, false)).toBe(0)
		expect(defeatScale(10_000, false)).toBe(0)
	})

	it('preserves the static defeat pose under reduced motion', () => {
		expect(defeatScale(650, true)).toBe(1)
	})
})
