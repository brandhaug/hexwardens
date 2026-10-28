import { Effect } from 'effect'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type OfflineMatchHandle } from '@hexwardens/game-logic/match/offline'
import { intentToClientMessage } from '@hexwardens/game-logic/match/wire-intent'
import { type IntentSubmission, type MatchClient } from './match-client'

export interface CreateOfflineMatchClientArgs {
	readonly match: OfflineMatchHandle
	/** The local human's tribe. */
	readonly tribe: Tribe
	/** Spectator handles observe but never act. */
	readonly spectator: boolean
}

/**
 * Offline adapter for the {@link MatchClient} seam. Wraps the in-process
 * {@link OfflineMatchHandle}: submissions await local persistence through
 * the same MatchLogic as the server. The actionResult arrives only after
 * the durable commit; a missing reply is a failed commit, never acceptance.
 *
 * Fog stays on the route's existing path — `getGameState()` is the local
 * authoritative state; per-viewer projection goes through
 * `match.snapshotFor(tribe)` exactly as before.
 */
export function createOfflineMatchClient(
	args: CreateOfflineMatchClientArgs
): MatchClient {
	const { match, tribe, spectator } = args
	let submitting = false
	const listeners = new Set<() => void>()
	const notify = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const canAct = (): boolean =>
		!spectator &&
		!submitting &&
		match.getState().gameState.currentPlayerTribe === tribe &&
		match.canAct()

	function submit(effect: Effect.Effect<void>): Promise<void> {
		submitting = true
		notify()
		return Effect.runPromise(
			effect.pipe(
				Effect.ensuring(
					Effect.sync(() => {
						submitting = false
						notify()
					})
				)
			)
		)
	}

	return {
		getGameState: () => match.getState().gameState,

		subscribe: (listener) => {
			listeners.add(listener)
			const unsubscribe = match.subscribe(listener)
			return () => {
				listeners.delete(listener)
				unsubscribe()
			}
		},

		canAct,

		async submitIntent(intent): Promise<IntentSubmission> {
			if (!canAct()) {
				return { accepted: false, reason: 'notAllowed', message: null }
			}
			// Capture the reply while awaiting the local transaction.
			const captured: CapturedActionResult = { result: null }
			const unsubscribe = match.subscribeServerMessages((msg) => {
				if (msg.type === 'actionResult') {
					captured.result = { success: msg.success, message: msg.message }
				} else if (msg.type === 'error') {
					captured.result = { success: false, message: msg.message }
				}
			})
			await submit(
				Effect.promise(() => match.send(intentToClientMessage(intent))).pipe(
					Effect.ensuring(
						Effect.sync(() => {
							unsubscribe()
						})
					)
				)
			)
			if (captured.result === null) {
				return {
					accepted: false,
					reason: 'invalid',
					message: 'Could not save this action locally. Please try again.'
				}
			}
			if (!captured.result.success) {
				return {
					accepted: false,
					reason: 'invalid',
					message: captured.result.message
				}
			}
			return { accepted: true }
		},

		async endTurn(): Promise<void> {
			if (!canAct()) {
				return
			}
			await submit(Effect.promise(() => match.endTurn()))
		},

		subscribeBroadcastEvents(listener) {
			return match.subscribeServerMessages((msg) => {
				if (msg.type === 'turnEvents') {
					listener(msg.events)
				}
			})
		}
	}
}

interface CapturedActionResult {
	result: { success: boolean; message: string } | null
}
