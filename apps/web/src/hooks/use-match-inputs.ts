import {
	getGamePreferences,
	getServerGamePreferences,
	subscribeGamePreferences
} from '@/lib/game-preferences'
import { recordOnboardingMovement } from '@/lib/onboarding/onboarding-progress'
import { useTapToConfirm } from './use-tap-to-confirm'
import { haptic } from '@/lib/haptics'
import {
	useLayoutEffect,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore
} from 'react'
import { type ActionIntent } from '@hexwardens/game-logic/actions/intent'
import { type Intent } from '@hexwardens/game-logic/dispatch'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { handleTileSelection } from '@hexwardens/game-logic/tile/tile-selection'
import { getAudioManager, playUiSfx } from '@/lib/audio/audio-service'
import { type MatchClient } from '@/lib/match-client'
import { type ShortcutEntry } from '@/lib/shortcuts/shortcut-registry'
import { type UnitCyclerApi } from '@/hooks/unit-cycler'
import { toast } from 'sonner'
import { Effect } from 'effect'

function commitIntent(
	client: MatchClient,
	intent: Intent,
	onAccepted: () => void
): Promise<void> {
	return Effect.runPromise(
		Effect.tryPromise(async () => client.submitIntent(intent)).pipe(
			Effect.match({
				onFailure: () => {
					toast.error(
						'The move could not be saved. Your previous position is unchanged. Try again.'
					)
				},
				onSuccess: (submission) => {
					if (submission.accepted) {
						onAccepted()
					} else if (submission.message) {
						toast.error(submission.message)
					}
				}
			})
		)
	)
}

function commitTurn(client: MatchClient): Promise<void> {
	return Effect.runPromise(
		Effect.tryPromise(async () => client.endTurn()).pipe(
			Effect.match({
				onFailure: () => {
					toast.error(
						'The turn could not be saved. Try ending your turn again.'
					)
				},
				onSuccess: () => {
					haptic('commit')
					playUiSfx('turnEnd')
				}
			})
		)
	)
}

interface UseMatchInputsArgs {
	readonly gameState: GameState
	readonly tribe: Tribe
	/**
	 * The Match seam. Intents are submitted eagerly through
	 * `client.submitIntent` the moment the player issues them — there is no
	 * client-side staging — and act-gating reads `client.canAct()` at call
	 * time. See `@/lib/match-client` for the adapter timing semantics.
	 */
	readonly client: MatchClient
	readonly cycler: UnitCyclerApi
	readonly selectedTile: BoardPosition | null
	readonly setSelectedTile: (position: BoardPosition | null) => void
}

export interface UseMatchInputsResult {
	readonly handleTileSelect: (position: BoardPosition | null) => void
	readonly handleCombat: (
		attackerPosition: BoardPosition,
		defenderPosition: BoardPosition
	) => void
	readonly handleMovement: (
		fromPosition: BoardPosition,
		toPosition: BoardPosition
	) => void
	readonly handleAction: (action: ActionIntent) => void
	readonly endTurnArmed: boolean
	readonly handleEndTurn: () => void
	readonly handleNextUnit: () => void
	readonly handlePreviousUnit: () => void
	readonly handlePassUnit: () => void
	readonly inGameShortcuts: readonly ShortcutEntry[]
}

/**
 * Shared Match input handlers + in-game shortcut entries used by both the
 * offline `/game` route and the online `/multiplayer-game` route. The Seam
 * is the {@link MatchClient} interface: offline routes pass the adapter over
 * the in-process `OfflineMatchHandle`, online routes pass the adapter over
 * the WebSocket `GameClient` (which owns the optimistic-apply overlay).
 *
 * Actions commit irrevocably when issued — there is no in-Turn undo. See
 * `docs/adr/0010-eager-action-commitment-no-in-turn-undo.md`.
 *
 * Selection is reset whenever `gameState.currentPlayerTribe` flips so a stale
 * selection never persists across a turn boundary.
 */
export function useMatchInputs(args: UseMatchInputsArgs): UseMatchInputsResult {
	const { gameState, tribe, client, cycler, selectedTile, setSelectedTile } =
		args

	const preferences = useSyncExternalStore(
		subscribeGamePreferences,
		getGamePreferences,
		getServerGamePreferences
	)
	const setSelectedTileRef = useRef(setSelectedTile)
	useLayoutEffect(() => {
		setSelectedTileRef.current = setSelectedTile
	}, [setSelectedTile])

	useEffect(() => {
		setSelectedTileRef.current(null)
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- A turn change intentionally clears selection via the current callback.
	}, [gameState.currentPlayerTribe])

	const gameStateRef = useRef(gameState)
	useLayoutEffect(() => {
		gameStateRef.current = gameState
	}, [gameState])
	const selectedTileRef = useRef(selectedTile)
	useLayoutEffect(() => {
		selectedTileRef.current = selectedTile
	}, [selectedTile])

	const handleTileSelect = useCallback(
		(position: BoardPosition | null) => {
			if (position === null) {
				setSelectedTile(null)
				playUiSfx('deselect')
				return
			}
			const newSelection = handleTileSelection(
				position,
				selectedTileRef.current,
				gameStateRef.current,
				tribe
			)
			playUiSfx(newSelection ? 'select' : 'deselect')
			setSelectedTile(newSelection)
		},
		[tribe, setSelectedTile]
	)

	const handleCombat = useCallback(
		(attackerPosition: BoardPosition, defenderPosition: BoardPosition) => {
			if (!client.canAct()) {
				return
			}
			void commitIntent(
				client,
				{
					kind: 'attack',
					from: attackerPosition,
					to: defenderPosition
				},
				() => {
					// Combat resolution audio comes from `useGameAudio` listening to
					// state diffs (deaths, damage). We fire the local swing cue here
					// so the player gets immediate feedback for their own action.
					getAudioManager().playSfx('unitDamage')
					// Follow the surviving unit: if the attacker survived and now
					// occupies the defender's tile, jump selection there. Otherwise
					// stay on the attacker's tile.
					const occupant =
						client.getGameState()?.units.board[defenderPosition.r_idx]?.[
							defenderPosition.q_idx
						]
					if (occupant?.unit?.tribe === tribe) {
						setSelectedTile(defenderPosition)
					} else {
						setSelectedTile(attackerPosition)
					}
				}
			)
		},
		[client, tribe, setSelectedTile]
	)

	const handleMovement = useCallback(
		(fromPosition: BoardPosition, toPosition: BoardPosition) => {
			if (!client.canAct()) {
				return
			}
			void commitIntent(
				client,
				{
					kind: 'move',
					from: fromPosition,
					to: toPosition
				},
				() => {
					recordOnboardingMovement()
					playUiSfx('move')
					setSelectedTile(toPosition)
				}
			)
		},
		[client, setSelectedTile]
	)

	const handleAction = useCallback(
		(action: ActionIntent) => {
			if (!client.canAct()) {
				return
			}
			void commitIntent(client, { kind: 'tileAction', action }, () => {
				playUiSfx('action')
			})
		},
		[client]
	)

	const commitEndTurn = useCallback(() => {
		if (!client.canAct()) {
			return
		}
		void commitTurn(client)
	}, [client])

	const {
		armed: endTurnArmed,
		trigger: confirmEndTurn,
		reset: resetEndTurn
	} = useTapToConfirm({ onCommit: commitEndTurn, onArm: () => haptic('tap') })
	useEffect(() => {
		resetEndTurn()
	}, [
		resetEndTurn,
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- A preference or turn change must discard the previous confirmation.
		preferences.confirmEndTurn,
		gameState.turn,
		gameState.currentPlayerTribe,
		gameState.isGameOver,
		tribe
	])
	const handleEndTurn = useCallback(() => {
		if (client.canAct()) {
			if (preferences.confirmEndTurn) {
				confirmEndTurn()
			} else {
				commitEndTurn()
			}
		}
	}, [client, confirmEndTurn, commitEndTurn, preferences.confirmEndTurn])

	const handleNextUnit = useCallback(() => {
		if (!client.canAct()) {
			return
		}
		cycler.cycleNext()
	}, [client, cycler])

	const handlePreviousUnit = useCallback(() => {
		if (!client.canAct()) {
			return
		}
		cycler.cyclePrevious()
	}, [client, cycler])

	const handlePassUnit = useCallback(() => {
		if (!client.canAct()) {
			return
		}
		cycler.markCurrentPassed()
		cycler.cycleNext()
	}, [client, cycler])

	const inGameShortcuts = useMemo<readonly ShortcutEntry[]>(
		() => [
			{
				code: 'Space',
				description: 'End turn',
				scope: 'inGame',
				category: 'Actions',
				handler: handleEndTurn
			},
			{
				code: 'Tab',
				description: 'Next unit needing orders',
				scope: 'inGame',
				category: 'Selection',
				handler: handleNextUnit
			},
			{
				code: 'Tab',
				description: 'Previous unit needing orders',
				scope: 'inGame',
				category: 'Selection',
				shift: true,
				handler: handlePreviousUnit
			},
			{
				code: 'KeyP',
				description: 'Skip selected unit this turn',
				scope: 'inGame',
				category: 'Selection',
				handler: handlePassUnit
			}
		],
		[handleEndTurn, handleNextUnit, handlePreviousUnit, handlePassUnit]
	)

	return {
		handleTileSelect,
		handleCombat,
		handleMovement,
		handleAction,
		endTurnArmed,
		handleEndTurn,
		handleNextUnit,
		handlePreviousUnit,
		handlePassUnit,
		inGameShortcuts
	}
}
