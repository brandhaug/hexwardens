import { Schema } from 'effect'
import { getCurrentPlayerState } from '../player/player-state'
import { decodePersistedMatchState } from './state-schema'
import { type MatchState } from './types'

export class MatchHydrationError extends Schema.TaggedError<MatchHydrationError>()(
	'MatchHydrationError',
	{ message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}

// Read-only compatibility with the preceding saved-match format. New writes
// contain only execution facts, never a library-specific snapshot or transient effects.
const legacyEnvelope = Schema.Struct({
	status: Schema.Literals(['active', 'done']),
	value: Schema.Union([
		Schema.Literals(['human', 'ended', 'destroyed']),
		Schema.Struct({ bot: Schema.Literals(['scheduled', 'running']) })
	]),
	context: Schema.Struct({ result: Schema.Null }),
	historyValue: Schema.Record(Schema.String, Schema.Never),
	children: Schema.Record(Schema.String, Schema.Never)
})
const legacyField = Schema.Struct({
	orchestration: Schema.optionalKey(Schema.String)
})

function migrateLegacy(encoded: string, state: MatchState): MatchState {
	const snapshot = Schema.decodeSync(Schema.fromJsonString(legacyEnvelope))(
		encoded
	)
	const current = getCurrentPlayerState(
		state.gameState.playerStates,
		state.gameState.currentPlayerTribe
	)
	const { value } = snapshot
	const consistent =
		value === 'destroyed'
			? snapshot.status === 'done'
			: snapshot.status === 'active' &&
				(value === 'ended'
					? state.gameState.isGameOver
					: !state.gameState.isGameOver &&
						(value === 'human' ? !current.isBot : current.isBot))
	if (!consistent || state.execution !== undefined) {
		throw new MatchHydrationError({
			message: 'Legacy lifecycle contradicts the match checkpoint'
		})
	}
	if (value === 'destroyed') {
		return { ...state, execution: 'cleanup-pending' }
	}
	if (value !== 'human' && value !== 'ended' && value.bot === 'running') {
		return { ...state, execution: 'bot-running' }
	}
	return state
}

/** Validate and convert once at the storage boundary; commands use trusted typed state. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- persisted match data is untrusted at this decoder boundary
export function restoreMatchState(input: unknown): MatchState {
	try {
		const decoded = decodePersistedMatchState(input)
		const { orchestration } = Schema.decodeUnknownSync(legacyField)(input)
		const state =
			orchestration === undefined
				? decoded
				: migrateLegacy(orchestration, decoded)
		const current = getCurrentPlayerState(
			state.gameState.playerStates,
			state.gameState.currentPlayerTribe
		)
		const cleanup = state.execution === 'cleanup-pending'
		let scheduleConsistent = state.turnSchedule === null
		if (!state.gameState.isGameOver && !cleanup) {
			scheduleConsistent = current.isBot
				? state.turnSchedule?.kind === 'bot'
				: state.turnSchedule === null || state.turnSchedule.kind === 'human'
		}
		const executionConsistent = cleanup
			? state.connectionCount === 0 &&
				state.cleanupDeadline !== null &&
				(state.gameState.isGameOver ||
					Object.keys(state.disconnectedPlayers).length === 0)
			: state.execution !== 'bot-running' ||
				(!state.gameState.isGameOver && current.isBot)
		if (!scheduleConsistent || !executionConsistent) {
			throw new MatchHydrationError({
				message: 'Execution or schedule contradicts the match checkpoint'
			})
		}
		return state
	} catch (cause) {
		throw cause instanceof MatchHydrationError
			? cause
			: new MatchHydrationError({
					message: 'Invalid persisted match checkpoint',
					cause
				})
	}
}
