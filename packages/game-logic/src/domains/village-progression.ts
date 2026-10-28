import { type BoardPosition } from '../board/position'
import { updateTile } from '../tile/tile'
import { type GameState, type PendingPerkChoice } from '../game'
import { type ReadonlyData } from '../type-utils'
import { type Tribe } from './tribe'
import {
	type Village,
	type VillageLevel,
	type VillagePerk,
	getPerkOptionsForLevel,
	villageLevels,
	villageLevelConstants,
	villageMaxPopulation
} from './village'

export type VillageExperienceResult = {
	village: Village
	levelUps: number
	/**
	 * Perk-pick prompts the Village earned, one per fresh level reached, in
	 * level order. Empty when no level-up happened. The caller queues these
	 * as `PendingPerkChoice` entries on the owning Tribe.
	 */
	perkPrompts: { level: VillageLevel; options: VillagePerk[] }[]
}

/**
 * Pure: applies an experience gain to a village, cascading level-ups until
 * either the level cap is reached or the remainder is below the next
 * threshold. Returns the updated village and the number of level-ups so the
 * caller can credit points to the village's owner tribe.
 */
export function addVillageExperience(
	village: Village,
	experienceGain: number
): VillageExperienceResult {
	const { experienceToNextLevel: nextLevelTable, salary: salaryTable } =
		villageLevelConstants

	const updated: Village = {
		...village,
		experience: village.experience + experienceGain
	}
	let levelUps = 0
	const perkPrompts: { level: VillageLevel; options: VillagePerk[] }[] = []

	while (
		updated.experience >= updated.experienceToNextLevel &&
		updated.level < 13
	) {
		const currentIndex = villageLevels.indexOf(updated.level)
		const nextLevel =
			villageLevels[Math.min(currentIndex + 1, villageLevels.length - 1)]
		if (nextLevel === undefined) {
			break
		}
		Object.assign(updated, {
			experience: updated.experience - updated.experienceToNextLevel,
			level: nextLevel,
			experienceToNextLevel: nextLevelTable[nextLevel],
			salary:
				updated.salary + salaryTable[nextLevel] - salaryTable[updated.level],
			maxPopulation:
				updated.maxPopulation +
				villageMaxPopulation(nextLevel, updated.kind) -
				villageMaxPopulation(updated.level, updated.kind)
		})
		levelUps++
		perkPrompts.push({
			level: nextLevel,
			options: getPerkOptionsForLevel(nextLevel)
		})
	}

	return { village: updated, levelUps, perkPrompts }
}

/** Appends earned prompts to the village owner's queue in level order. */
export function calculateVillageRewards(
	pending: ReadonlyData<
		Pick<GameState, 'pendingVillageLevelUps' | 'pendingPerkChoices'>
	>,
	villagePosition: BoardPosition,
	{ village, levelUps, perkPrompts }: VillageExperienceResult
): { tribe: Tribe; levelUps: number; choices: PendingPerkChoice[] } | null {
	if (levelUps === 0 || village.tribe === null) {
		return null
	}
	const tribe = village.tribe
	return {
		tribe,
		levelUps: (pending.pendingVillageLevelUps[tribe] ?? 0) + levelUps,
		choices: [
			...(pending.pendingPerkChoices[tribe] ?? []).map((choice) => ({
				...choice,
				options: [...choice.options]
			})),
			...perkPrompts.map((prompt) => ({ villagePosition, ...prompt }))
		]
	}
}

/**
 * Applies experience to the village at `villagePosition` and queues a
 * Perk-choice prompt on the owner Tribe for each fresh level the Village
 * just reached. The tribe is read from the village itself — never from
 * `currentPlayerTribe` — so captured villages award prompts to their new
 * owner even if the commit happens later.
 *
 * Prompts drain via the `selectPerk` intent (see
 * `actions/features/select-perk/`); the Turn Executor's
 * `villageExperienceCommit` phase only emits a summary `villageLevel` event.
 */
export function applyVillageExperience(
	gameState: GameState,
	villagePosition: BoardPosition,
	experienceGain: number
): GameState {
	const tile =
		gameState.units.board[villagePosition.r_idx]?.[villagePosition.q_idx]
	const village = tile?.item
	if (village?.type !== 'village') {
		return gameState
	}

	const experience = addVillageExperience(village, experienceGain)

	const newBoard = updateTile(gameState.units.board, villagePosition, {
		item: experience.village
	})

	const rewards = calculateVillageRewards(
		gameState,
		villagePosition,
		experience
	)
	if (!rewards) {
		return {
			...gameState,
			units: { ...gameState.units, board: newBoard }
		}
	}

	return {
		...gameState,
		units: { ...gameState.units, board: newBoard },
		pendingVillageLevelUps: {
			...gameState.pendingVillageLevelUps,
			[rewards.tribe]: rewards.levelUps
		},
		pendingPerkChoices: {
			...gameState.pendingPerkChoices,
			[rewards.tribe]: rewards.choices
		}
	}
}
