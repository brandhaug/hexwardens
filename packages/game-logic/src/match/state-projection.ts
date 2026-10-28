import { Result } from 'effect'
import { type Tribe } from '../domains/tribe'
import { type FogProjectionError } from '../fog-of-war/errors'
import { type MatchState } from './types'
import { buildGameStateMessage, type GameStateMessage } from './view-projection'

/**
 * Per-Tribe outcome of projecting one authoritative {@link MatchState}
 * through Fog of War. Either the exact `{ type: 'gameState' }` server
 * message ready to ship to that Tribe, or an explicit projection-failure
 * diagnostic carrying the typed {@link FogProjectionError}.
 *
 * Pure data — no broadcasting, no logging. The caller (the `MatchHost`
 * adapter in `logic.ts`) owns the fan-out and logging policy.
 */
export type TribeProjection =
	| {
			readonly ok: true
			readonly tribe: Tribe
			readonly message: GameStateMessage
	  }
	| {
			readonly ok: false
			readonly tribe: Tribe
			readonly error: FogProjectionError
	  }

/**
 * Project `matchState` for every Tribe in `tribes`, preserving first-seen
 * order and de-duplicating repeats (multiple sockets can back one Tribe).
 * Each unique Tribe gets exactly one result: a fog-filtered `gameState`
 * message on success, or a failure entry on projection error. One Tribe's
 * failure never affects the others — the remaining Tribes still project.
 */
export function projectStateForTribes(
	matchState: MatchState,
	tribes: readonly Tribe[]
): TribeProjection[] {
	const seen = new Set<Tribe>()
	const projections: TribeProjection[] = []
	for (const tribe of tribes) {
		if (seen.has(tribe)) {
			continue
		}
		seen.add(tribe)
		const projected = buildGameStateMessage(matchState, tribe)
		projections.push(
			Result.isFailure(projected)
				? { ok: false, tribe, error: projected.failure }
				: { ok: true, tribe, message: projected.success }
		)
	}
	return projections
}

/**
 * Structured payload for the `fog_projection_failed` wide event. Key set
 * and shape are load-bearing: `logic.ts` has logged exactly
 * `{ tribe, error, message, path }` since the projection path was built —
 * keep this stable so log queries don't silently break.
 */
export type FogProjectionFailureLogData = {
	tribe: Tribe
	error: string
	message: string
	path: string | undefined
}

/** Flatten a typed projection failure into the log-stable record. */
export function fogProjectionFailureLogData(
	tribe: Tribe,
	error: FogProjectionError
): FogProjectionFailureLogData {
	return {
		tribe,
		error: error._tag,
		// oxlint-disable-next-line hexwardens/no-unknown-error-message -- FogProjectionError is a closed tagged union with a diagnostic message
		message: error.message,
		path: 'path' in error ? error.path.map(String).join('.') : undefined
	}
}
