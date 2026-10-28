export type {
	LobbyConfig,
	LobbySlot,
	LobbyState,
	MatchConfig,
	MatchResult,
	ServerMessage
} from '@hexwardens/game-logic/multiplayer/types'

import { type PlatformRateLimiter } from './platform-rate-limit'
// oxlint-disable-next-line import/consistent-type-specifier-style -- Erase the host class import; an empty runtime import would load cloudflare:workers in Node tests.
import type { Match } from './match'
// oxlint-disable-next-line import/consistent-type-specifier-style -- Erase the host class import; an empty runtime import would load cloudflare:workers in Node tests.
import type { Matchmaker } from './matchmaker'
// oxlint-disable-next-line import/consistent-type-specifier-style -- Erase the host class import; an empty runtime import would load cloudflare:workers in Node tests.
import type { Presence } from './presence'

export type Env = {
	GAME_RATE_LIMITER?: PlatformRateLimiter
	MATCHMAKER: DurableObjectNamespace<Matchmaker>
	MATCH: DurableObjectNamespace<Match>
	PRESENCE: DurableObjectNamespace<Presence>
	DB: D1Database
	AUTH_JWT_SECRET: string
	ALLOWED_ORIGIN: string
	// Dev/E2E escape hatch, set via `wrangler dev --var`. Never configured in
	// production deploys — locally all clients share one bucket because
	// CF-Connecting-IP is absent, so test suites would trip the limits.
	HEXWARDENS_DISABLE_RATE_LIMIT?: string
}
