/**
 * Canonical reactivity keys for query/mutation invalidation in `effect-atom`.
 *
 * Mutations pass `reactivityKeys` at the call site; any query atom whose
 * `reactivityKeys` overlap will refresh automatically. Use these constants
 * everywhere; do not hand-roll string keys at call sites.
 */
export const ReactivityKey = {
	leaderboard: 'leaderboard',
	profile: 'profile',
	achievements: 'achievements',
	cosmetics: 'cosmetics',
	daily: 'daily',
	presence: 'presence'
} as const
