import { describe, expect, it } from 'vite-plus/test'
import { type PlayerState } from '../player/player-state'
import { canAfford, hasTechRequirement } from './player'

function mkPlayer(overrides?: Partial<PlayerState>): PlayerState {
	return {
		id: 'player_1',
		name: 'P1',
		tribe: 'barbarians',
		money: 10,
		exploration: {},
		researchedTechs: [],
		researchInProgress: null,
		isBot: false,
		difficulty: 'Beginner',
		...overrides
	}
}

describe('canAfford', () => {
	it('returns false for undefined player', () => {
		expect(canAfford(undefined, 1)).toBe(false)
	})

	it('returns true when money equals cost', () => {
		expect(canAfford(mkPlayer({ money: 5 }), 5)).toBe(true)
	})

	it('returns true when money exceeds cost', () => {
		expect(canAfford(mkPlayer({ money: 10 }), 3)).toBe(true)
	})

	it('returns false when money is below cost', () => {
		expect(canAfford(mkPlayer({ money: 2 }), 5)).toBe(false)
	})

	it('treats zero cost as always affordable for a defined player', () => {
		expect(canAfford(mkPlayer({ money: 0 }), 0)).toBe(true)
	})
})

describe('hasTechRequirement', () => {
	it('returns true when no tech is required', () => {
		expect(hasTechRequirement(mkPlayer(), undefined)).toBe(true)
	})

	it('returns false when player is undefined and tech is required', () => {
		expect(hasTechRequirement(undefined, 'climbing')).toBe(false)
	})

	it('returns true when player has the required tech', () => {
		expect(
			hasTechRequirement(
				mkPlayer({ researchedTechs: ['climbing'] }),
				'climbing'
			)
		).toBe(true)
	})

	it('returns false when player lacks the required tech', () => {
		expect(hasTechRequirement(mkPlayer(), 'climbing')).toBe(false)
	})
})
