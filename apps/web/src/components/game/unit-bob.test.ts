import { unitBobOffset } from './unit-bob'

const peak = (isHero: boolean) => {
	let max = 0
	for (let t = 0; t < 4; t += 0.01) {
		const { y } = unitBobOffset(t, isHero, false)
		if (Math.abs(y) > max) {
			max = Math.abs(y)
		}
	}
	return max
}

describe('unitBobOffset', () => {
	it('returns zero offset when reducedMotion is true', () => {
		expect(unitBobOffset(0.42, false, true)).toEqual({ y: 0, yaw: 0 })
		expect(unitBobOffset(1, true, true)).toEqual({ y: 0, yaw: 0 })
	})

	it('returns a non-zero bob when reducedMotion is false', () => {
		const { y, yaw } = unitBobOffset(0.42, false, false)
		expect(y === 0 && yaw === 0).toBe(false)
	})

	it('uses a larger amplitude for hero units', () => {
		expect(peak(true)).toBeGreaterThan(peak(false))
	})
})
