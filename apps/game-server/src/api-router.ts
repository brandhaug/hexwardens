import { HexwardensApi } from '@hexwardens/api'
import { Layer } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { HttpServer } from 'effect/http'
import { type Database } from '@hexwardens/db/effect'
import { AchievementsLive } from './achievements'
import { CosmeticsLive } from './cosmetics'
import { DailyLive } from './daily'
import { AchievementsHandlers } from './handlers/achievements'
import { CosmeticsHandlers } from './handlers/cosmetics'
import { DailyHandlers } from './handlers/daily'
import { HealthHandlers } from './handlers/health'
import { LeaderboardHandlers } from './handlers/leaderboard'
import { PresenceHandlers } from './handlers/presence'
import { ProfileHandlers } from './handlers/profile'
import { sessionAuthLive, type SessionAuthEnv } from './handlers/session-auth'
import { LeaderboardLive } from './leaderboard'
import { type PresenceCounter } from './presence-service'

const HandlersLive = Layer.mergeAll(
	LeaderboardHandlers,
	ProfileHandlers,
	AchievementsHandlers,
	CosmeticsHandlers,
	DailyHandlers,
	PresenceHandlers,
	HealthHandlers
)

const ServicesLive = Layer.mergeAll(
	LeaderboardLive,
	AchievementsLive,
	CosmeticsLive,
	DailyLive
)

export const makeApiLive = (
	env: SessionAuthEnv,
	dbLayer: Layer.Layer<Database>,
	presenceLive: Layer.Layer<PresenceCounter>
) =>
	HttpApiBuilder.layer(HexwardensApi).pipe(
		Layer.provide(HandlersLive),
		Layer.provide(sessionAuthLive(env)),
		// Request-time handler dependencies must be *merged* into the layer
		// output — `HttpRouter.toWebHandler` subtracts each route's `Requires`
		// against the layer's provided services to type the web handler.
		Layer.provideMerge(ServicesLive),
		Layer.provide(dbLayer),
		Layer.provideMerge(presenceLive),
		Layer.provideMerge(HttpServer.layerServices)
	)
