import { toast } from 'sonner'
import {
	ACHIEVEMENT_REGISTRY,
	type AchievementId
} from '@hexwardens/game-logic/achievements/registry'
import { playUiSfx } from '@/lib/audio/audio-service'

/**
 * Renders one toast per newly-unlocked achievement and plays the unlock
 * stinger once for the entire batch — a single chord per `achievementsUnlocked`
 * server message keeps simultaneous unlocks from layering tones into mush.
 */
export function showAchievementUnlockToasts(
	achievementIds: readonly AchievementId[]
) {
	if (achievementIds.length === 0) {
		return
	}
	playUiSfx('achievement')
	for (const id of achievementIds) {
		const def = ACHIEVEMENT_REGISTRY[id]
		toast.success(`Achievement unlocked: ${def.name}`, {
			description: def.description,
			duration: 6000
		})
	}
}
