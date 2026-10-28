import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../test/game-test-helpers'
import { advanceTurn } from '../turns/index'
import {
	addVillageExperience,
	applyVillageExperience
} from './village-progression'

describe('addVillageExperience (pure)', () => {
	it('returns zero level-ups when below threshold', () => {
		const village = createTestVillage('barbarians', { experience: 0 })
		const result = addVillageExperience(village, 1)
		expect(result.levelUps).toBe(0)
		expect(result.village.level).toBe(1)
		expect(result.village.experience).toBe(1)
	})

	it('levels up and resets the carry-over experience', () => {
		const village = createTestVillage('barbarians', {
			level: 1,
			experience: 0,
			experienceToNextLevel: 2
		})
		const result = addVillageExperience(village, 3)
		expect(result.levelUps).toBe(1)
		expect(result.village.level).toBe(2)
		expect(result.village.experience).toBe(1)
		expect(result.village.experienceToNextLevel).toBe(3)
	})

	it('cascades multiple level-ups from a single large gain', () => {
		const village = createTestVillage('barbarians', {
			level: 1,
			experience: 0,
			experienceToNextLevel: 2
		})
		const result = addVillageExperience(village, 100)
		expect(result.village.level).toBe(13)
		expect(result.levelUps).toBe(12)
	})

	it('updates salary and maxPopulation on level-up', () => {
		const village = createTestVillage('barbarians', {
			level: 1,
			experience: 0,
			experienceToNextLevel: 2,
			salary: 1,
			maxPopulation: 2
		})
		const result = addVillageExperience(village, 2)
		expect(result.village.salary).toBe(2)
		expect(result.village.maxPopulation).toBe(4)
	})

	it('preserves the capital +1 maxPopulation bonus across level-ups', () => {
		const capital = createTestVillage('barbarians', {
			kind: 'capital',
			level: 1,
			experience: 0,
			experienceToNextLevel: 2,
			salary: 1,
			maxPopulation: 3
		})
		const result = addVillageExperience(capital, 2)
		expect(result.village.level).toBe(2)
		// level-2 base is 4; capital adds +1 = 5
		expect(result.village.maxPopulation).toBe(5)
		expect(result.village.kind).toBe('capital')
	})

	it('does not level beyond the cap', () => {
		const village = createTestVillage('barbarians', {
			level: 13,
			experience: 0,
			experienceToNextLevel: 14
		})
		const result = addVillageExperience(village, 100)
		expect(result.village.level).toBe(13)
		expect(result.levelUps).toBe(0)
	})

	it('does not read from or mutate any tribe state', () => {
		const nullOwner = createTestVillage(null, {
			experience: 0,
			experienceToNextLevel: 2
		})
		const result = addVillageExperience(nullOwner, 2)
		expect(result.village.tribe).toBeNull()
		expect(result.levelUps).toBe(1)
	})
})

describe('applyVillageExperience', () => {
	const villagePos = { q_idx: 2, r_idx: 2 }

	function gameStateWithVillage(tribe: 'barbarians' | 'rogues' | null) {
		const board = createTestBoard(2)
		requireTestValue(board[villagePos.r_idx])[villagePos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[villagePos.r_idx])[villagePos.q_idx]
			),
			item: createTestVillage(tribe, {
				level: 1,
				experience: 0,
				experienceToNextLevel: 2
			})
		}
		return createTestGameState({ board })
	}

	it('accumulates level-ups under the village owner tribe', () => {
		const state = gameStateWithVillage('rogues')
		const next = applyVillageExperience(state, villagePos, 2)
		expect(next.pendingVillageLevelUps.rogues).toBe(1)
		expect(next.pendingVillageLevelUps.barbarians).toBeUndefined()
	})

	it('awards points to the village owner, not currentPlayerTribe', () => {
		// currentPlayerTribe is 'barbarians' (from createTestGameState default),
		// but the village belongs to 'rogues' — simulating a captured village
		// whose experience is applied under a different player's turn.
		const state = gameStateWithVillage('rogues')
		const after = applyVillageExperience(state, villagePos, 2)
		expect(after.currentPlayerTribe).toBe('barbarians')
		expect(after.pendingVillageLevelUps.rogues).toBe(1)
		expect(after.pendingVillageLevelUps.barbarians).toBeUndefined()
	})

	it('no-ops when the village has no owner', () => {
		const state = gameStateWithVillage(null)
		const next = applyVillageExperience(state, villagePos, 2)
		expect(next.pendingVillageLevelUps).toEqual({})
	})

	it('accumulates additively across multiple calls', () => {
		const state = gameStateWithVillage('barbarians')
		const once = applyVillageExperience(state, villagePos, 2)
		const twice = applyVillageExperience(once, villagePos, 3)
		expect(twice.pendingVillageLevelUps.barbarians).toBe(2)
	})
})

describe('Perk-pick prompts on level-up', () => {
	it('queues a Perk-choice prompt for each fresh level the Village reached', () => {
		const village = createTestVillage('barbarians', {
			level: 1,
			experience: 0,
			experienceToNextLevel: 2
		})
		const result = addVillageExperience(village, 5)
		expect(result.perkPrompts).toHaveLength(2)
		expect(result.perkPrompts[0]?.level).toBe(2)
		expect(result.perkPrompts[1]?.level).toBe(3)
	})

	it('offers `special_unit` only at the level-5 transition', () => {
		const v1to5 = createTestVillage('barbarians', {
			level: 4,
			experience: 0,
			experienceToNextLevel: 5
		})
		const result = addVillageExperience(v1to5, 5)
		const lvl5Prompt = result.perkPrompts.find((p) => p.level === 5)
		expect(lvl5Prompt?.options).toContain('special_unit')

		const v2 = createTestVillage('barbarians', {
			level: 1,
			experience: 0,
			experienceToNextLevel: 2
		})
		const lvl2 = addVillageExperience(v2, 2)
		expect(lvl2.perkPrompts[0]?.options).not.toContain('special_unit')
	})

	it('queues prompts on the Village owner Tribe, not currentPlayerTribe', () => {
		const villagePos = { q_idx: 2, r_idx: 2 }
		const board = createTestBoard(2)
		requireTestValue(board[villagePos.r_idx])[villagePos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[villagePos.r_idx])[villagePos.q_idx]
			),
			item: createTestVillage('rogues', {
				level: 4,
				experience: 0,
				experienceToNextLevel: 5
			})
		}
		const state = createTestGameState({ board })
		const next = applyVillageExperience(state, villagePos, 5)
		const roguesQueue = next.pendingPerkChoices.rogues
		expect(roguesQueue).toHaveLength(1)
		expect(roguesQueue?.[0]?.level).toBe(5)
		expect(roguesQueue?.[0]?.options).toContain('special_unit')
	})
})

describe('villageExperienceCommit phase (via advanceTurn)', () => {
	const villagePos = { q_idx: 2, r_idx: 2 }

	it('emits a villageLevel event for the village owner and clears the bucket', () => {
		const board = createTestBoard(2)
		requireTestValue(board[villagePos.r_idx])[villagePos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[villagePos.r_idx])[villagePos.q_idx]
			),
			item: createTestVillage('rogues')
		}
		const state = createTestGameState({
			board,
			pendingVillageLevelUps: { rogues: 2 }
		})

		const { state: next, events } = advanceTurn(state)

		expect(events).toContainEqual({
			type: 'villageLevel',
			tribe: 'rogues',
			levelUps: 2
		})
		expect(next.pendingVillageLevelUps).toEqual({})
	})
})

it('preserves earned salary and capacity bonuses through later levels', () => {
	const village = createTestVillage('barbarians', {
		salary: 4,
		maxPopulation: 5
	})
	const next = addVillageExperience(village, 2).village
	expect(next.level).toBe(2)
	expect(next.salary).toBe(5)
	expect(next.maxPopulation).toBe(7)
})
