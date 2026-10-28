import { unitAnimationActionConfig } from './unit-animation-mixer'

describe('unitAnimationActionConfig', () => {
	it('loops idle and walk indefinitely at full speed', () => {
		expect(unitAnimationActionConfig('idle', false)).toEqual({
			loop: 'repeat',
			timeScale: 1,
			clampWhenFinished: false,
			pauseAtZero: false
		})
		expect(unitAnimationActionConfig('walk', false)).toEqual({
			loop: 'repeat',
			timeScale: 1,
			clampWhenFinished: false,
			pauseAtZero: false
		})
	})

	it('plays attack, defend, and death once and clamps at the end', () => {
		expect(unitAnimationActionConfig('attack', false)).toEqual({
			loop: 'once',
			timeScale: 1,
			clampWhenFinished: true,
			pauseAtZero: false
		})
		expect(unitAnimationActionConfig('defend', false)).toEqual({
			loop: 'once',
			timeScale: 1,
			clampWhenFinished: true,
			pauseAtZero: false
		})
		expect(unitAnimationActionConfig('death', false)).toEqual({
			loop: 'once',
			timeScale: 1,
			clampWhenFinished: true,
			pauseAtZero: false
		})
	})

	it('slows non-looping animations under reduced motion', () => {
		expect(unitAnimationActionConfig('attack', true).timeScale).toBe(0.3)
		expect(unitAnimationActionConfig('defend', true).timeScale).toBe(0.3)
		expect(unitAnimationActionConfig('death', true).timeScale).toBe(0.3)
	})

	it('keeps looping animations at full speed under reduced motion', () => {
		expect(unitAnimationActionConfig('walk', true).timeScale).toBe(1)
	})

	it('pauses idle at frame zero under reduced motion', () => {
		expect(unitAnimationActionConfig('idle', true).pauseAtZero).toBe(true)
		expect(unitAnimationActionConfig('idle', false).pauseAtZero).toBe(false)
		expect(unitAnimationActionConfig('walk', true).pauseAtZero).toBe(false)
	})
})
