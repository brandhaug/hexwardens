import { HttpApi } from 'effect/http-api'
import { AchievementsApi } from './achievements.ts'
import { CosmeticsApi } from './cosmetics.ts'
import { DailyApi } from './daily.ts'
import { HealthApi } from './health.ts'
import { LeaderboardApi } from './leaderboard.ts'
import { PresenceApi } from './presence.ts'
import { ProfileApi } from './profile.ts'

export {
	GameTokenPayloadSchema,
	SessionAuth,
	SessionContext,
	Unauthorized,
	type GameTokenPayload,
	type SessionUser
} from './auth.ts'
export { InternalError, PlayerNotFoundError } from './errors.ts'
export {
	LeaderboardApi,
	LeaderboardEntry,
	LeaderboardPage,
	LeaderboardQuery,
	SortSchema,
	type LeaderboardSort
} from './leaderboard.ts'
export {
	MatchHistoryEntry,
	PlayerProfile,
	ProfileApi,
	ProfileResponse,
	StatsBlock,
	TribeStatsBlock,
	UserRef,
	type ProfileResponse as ProfileResponseType,
	type TribeStats
} from './profile.ts'
export {
	AchievementUnlock,
	AchievementsApi,
	AchievementsResponse
} from './achievements.ts'
export {
	CosmeticSlotSchema,
	CosmeticUnlock,
	CosmeticsApi,
	EquippedCosmetics,
	PlayerCosmeticsResponse,
	type CosmeticSlot
} from './cosmetics.ts'
export {
	DailyApi,
	DailyBest,
	DailyChallengeMeta,
	DailyChallengeView,
	DailyLeaderboardEntry,
	type DailyChallengeCoreView
} from './daily.ts'
export { PresenceApi } from './presence.ts'
export { HealthApi } from './health.ts'

export const HexwardensApi = HttpApi.make('hexwardens')
	.add(LeaderboardApi)
	.add(ProfileApi)
	.add(AchievementsApi)
	.add(CosmeticsApi)
	.add(DailyApi)
	.add(PresenceApi)
	.add(HealthApi)
