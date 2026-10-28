import { type BoardPosition } from '../board/position'
import { type GameWorld } from '../engine/world-contract'
import {
	addVillageExperience,
	calculateVillageRewards
} from '../domains/village-progression'
import { findControllingVillage } from '../domains/village'
import { tribes, type Tribe } from '../domains/tribe'
import { type GameState } from '../game'

export function pendingChoices(world: GameWorld) {
	const result: GameState['pendingPerkChoices'] = {}
	const pending = world.metadata().pendingPerkChoices
	for (const tribe of tribes) {
		const choices = pending[tribe]
		if (choices) {
			result[tribe] = choices.map((choice) => ({
				...choice,
				options: [...choice.options]
			}))
		}
	}
	return result
}

export function awardVillageExperience(
	world: GameWorld,
	at: BoardPosition,
	amount: number
): void {
	const item = world.tile(at)?.item
	if (item?.type !== 'village') {
		return
	}
	const experience = addVillageExperience(item, amount)
	world.updateTile(at, { item: experience.village })
	const metadata = world.metadata()
	const rewards = calculateVillageRewards(metadata, at, experience)
	if (!rewards) {
		return
	}
	world.updateMetadata({
		pendingVillageLevelUps: {
			...metadata.pendingVillageLevelUps,
			[rewards.tribe]: rewards.levelUps
		},
		pendingPerkChoices: {
			...pendingChoices(world),
			[rewards.tribe]: rewards.choices
		}
	})
}

export function awardControllingVillage(
	world: GameWorld,
	at: BoardPosition,
	tribe: Tribe,
	amount: number
): boolean {
	const village = findControllingVillage(at, world.snapshot(), tribe)
	if (!village) {
		return false
	}
	awardVillageExperience(world, village.position, amount)
	return true
}
