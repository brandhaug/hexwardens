import type Prando from 'prando'

const rewards = ['money', 'experience', 'unit'] as const
export type RuinsReward = (typeof rewards)[number]

export type Ruins = {
	type: 'ruins'
	reward: RuinsReward
}

// The reward is fixed at creation time (board generation) and revealed on
// exploration, so it must come from the seeded board rng — `Math.random`
// here would break board-generation determinism.
export const createRuins = (rng: Prando): Ruins => {
	const randomReward = rewards[rng.nextInt(0, rewards.length - 1)]
	if (!randomReward) {
		throw new Error('Ruins rewards must not be empty')
	}

	return {
		type: 'ruins',
		reward: randomReward
	}
}
