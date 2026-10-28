import {
	ACHIEVEMENT_LIST,
	type AchievementId
} from '@hexwardens/game-logic/achievements/registry'
import { type AchievementUnlock } from '@hexwardens/api/achievements'

export type AchievementProgressEntry = {
	readonly achievement: {
		readonly id: AchievementId
		readonly name: string
		readonly description: string
	}
	readonly unlocked: boolean
	readonly unlockedAt: string | null
}

export type AchievementProgress = {
	readonly username: string
	readonly entries: ReadonlyArray<AchievementProgressEntry>
	readonly unlockedCount: number
	readonly totalCount: number
}

export function progressFromUnlocks(
	username: string,
	unlocks: ReadonlyArray<AchievementUnlock>
): AchievementProgress {
	const totalCount = ACHIEVEMENT_LIST.length
	const unlockedById = new Map<string, string>()
	for (const unlock of unlocks) {
		unlockedById.set(unlock.achievementId, unlock.unlockedAt)
	}

	const entries = ACHIEVEMENT_LIST.map((achievement) => {
		const unlockedAt = unlockedById.get(achievement.id)
		return {
			achievement: {
				id: achievement.id,
				name: achievement.name,
				description: achievement.description
			},
			unlocked: unlockedAt !== undefined,
			unlockedAt: unlockedAt ?? null
		}
	})

	return {
		username,
		entries,
		unlockedCount: unlockedById.size,
		totalCount
	}
}

export function emptyProgress(username: string): AchievementProgress {
	return progressFromUnlocks(username, [])
}
