import { hasResearchedTech, type Tech } from '../domains/tech'
import { type PlayerRead } from '../player/player-state'

export function canAfford(
	playerState: Pick<PlayerRead, 'money'> | undefined,
	cost: number
): boolean {
	return !!playerState && playerState.money >= cost
}

export function hasTechRequirement(
	playerState: Pick<PlayerRead, 'researchedTechs'> | undefined,
	requiredTech: Tech | null | undefined
): boolean {
	if (!requiredTech) {
		return true
	}
	if (!playerState) {
		return false
	}
	return hasResearchedTech(playerState.researchedTechs, requiredTech)
}
