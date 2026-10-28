import { describe, expect, it } from 'vite-plus/test'
import { tribes } from '@hexwardens/game-logic/domains/tribe'
import { getTribeMeta } from './tribe-meta'

describe('getTribeMeta', () => {
	it('returns a banner entry for every tribe', () => {
		for (const tribe of tribes) {
			const meta = getTribeMeta(tribe)
			expect(meta.tribe).toBe(tribe)
			expect(meta.heroLabel.length).toBeGreaterThan(0)
			expect(meta.terrain.length).toBeGreaterThan(0)
		}
	})

	it('uses the canonical hero unit slug as the hero label, humanised', () => {
		// barbarians/berserker → "Berserker"
		expect(getTribeMeta('barbarians').heroLabel).toBe('Berserker')
		// skeletons/skeleton_golem → "Skeleton Golem" — underscore split, title case.
		expect(getTribeMeta('skeletons').heroLabel).toBe('Skeleton Golem')
	})

	it('exposes the home terrain so players see their landscape at a glance', () => {
		expect(getTribeMeta('barbarians').terrain).toBe('tundra')
		expect(getTribeMeta('templars').terrain).toBe('forest')
	})
})
