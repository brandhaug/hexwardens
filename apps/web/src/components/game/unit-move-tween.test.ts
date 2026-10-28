import { unitMoveTween } from './unit-move-tween'

describe('unitMoveTween', () => {
	const from = [0, 0, 0] as const
	const to = [4, 0, 0] as const

	it('starts at the from position when t=0', () => {
		expect(unitMoveTween(from, to, 0)).toEqual([0, 0, 0])
	})

	it('ends at the to position when t=1', () => {
		expect(unitMoveTween(from, to, 1)).toEqual([4, 0, 0])
	})

	it('places the unit on a horizontal arc midpoint at t=0.5', () => {
		const [x, y, z] = unitMoveTween(from, to, 0.5)
		expect(x).toBeCloseTo(2)
		expect(z).toBeCloseTo(0)
		expect(y).toBeGreaterThan(0)
	})

	it('clamps t below 0 to the from position', () => {
		expect(unitMoveTween(from, to, -0.5)).toEqual([0, 0, 0])
	})

	it('clamps t above 1 to the to position', () => {
		expect(unitMoveTween(from, to, 1.5)).toEqual([4, 0, 0])
	})
})

// Failure cases: abrupt starts/stops, overshoot, stationary hops, and motion
// continuing after the player enables reduced motion.
describe('movement continuity', () => {
	it('eases into and out of the move without overshooting', () => {
		expect(unitMoveTween([0, 0, 0], [4, 0, 0], 0.1)[0]).toBeLessThan(0.4)
		expect(unitMoveTween([0, 0, 0], [4, 0, 0], 0.9)[0]).toBeGreaterThan(3.6)
	})

	it('does not hop when the position is unchanged', () => {
		expect(unitMoveTween([2, 1, 3], [2, 1, 3], 0.5)).toEqual([2, 1, 3])
	})

	it('places the piece at its destination under reduced motion', () => {
		expect(unitMoveTween([0, 0, 0], [4, 2, 1], 0.2, true)).toEqual([4, 2, 1])
	})
})
