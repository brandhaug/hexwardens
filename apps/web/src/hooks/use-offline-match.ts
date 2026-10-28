import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore
} from 'react'
import { constVoid } from 'effect/Function'
import {
	delayPacer,
	immediatePacer
} from '@hexwardens/game-logic/bot/bot-pacer'
import { type Difficulty } from '@hexwardens/game-logic/difficulty'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type FilteredGameState } from '@hexwardens/game-logic/fog-of-war/schema'
import { type GameState } from '@hexwardens/game-logic/game'
import { type MatchState } from '@hexwardens/game-logic/match/types'
import {
	createOfflineMatch,
	type OfflineMatchHandle
} from '@hexwardens/game-logic/match/offline'
import { type MatchConfig } from '@hexwardens/game-logic/multiplayer/types'
import { buildOfflinePlayers } from '@/lib/offline-match-config'

export interface UseOfflineMatchArgs {
	readonly tribe: Tribe
	readonly mapSize: MatchConfig['mapSize']
	readonly numberOfOpponents: number
	readonly difficulty: Difficulty
	readonly playerName: string
	readonly spectator: boolean
	readonly botDelay: number | undefined
	readonly initialState?: MatchState | undefined
	readonly commitLocally: (state: MatchState) => Promise<void>
}

export interface ReadyOfflineMatch {
	readonly kind: 'ready'
	readonly match: OfflineMatchHandle
	readonly viewTribe: Tribe
	readonly viewState: FilteredGameState
	readonly gameState: GameState
}

type MatchLoad =
	| { kind: 'loading' }
	| { kind: 'failed'; message: string }
	| { kind: 'ready'; match: OfflineMatchHandle }

export type UseOfflineMatchResult =
	| Exclude<MatchLoad, { kind: 'ready' }>
	| ReadyOfflineMatch

/** Owns an offline actor only while mounted, and exposes it after its initial durable commit. */
export function useOfflineMatch(
	args: UseOfflineMatchArgs
): UseOfflineMatchResult {
	const {
		tribe,
		mapSize,
		numberOfOpponents,
		difficulty,
		spectator,
		botDelay,
		initialState,
		commitLocally
	} = args
	// A name change affects the next match, not the identity of this mounted match.
	// oxlint-disable-next-line react/hook-use-state -- The initial player name is fixed for the mounted match.
	const [playerName] = useState(args.playerName)
	const [load, setLoad] = useState<MatchLoad>({ kind: 'loading' })
	useEffect(() => {
		let active = true
		// oxlint-disable-next-line react/set-state-in-effect -- This effect owns acquisition and disposal of the external match actor.
		setLoad({ kind: 'loading' })
		const match = buildOfflineMatch({
			tribe,
			mapSize,
			numberOfOpponents,
			difficulty,
			playerName,
			spectator,
			botDelay,
			initialState,
			commitLocally
		})
		void match.ready().then(
			() => {
				if (active) {
					setLoad({ kind: 'ready', match })
				}
				return null
			},
			() => {
				match.destroy()
				if (active) {
					setLoad({
						kind: 'failed',
						message:
							'The match could not be saved on this device. Check available storage and reload to try again.'
					})
				}
				return null
			}
		)
		return () => {
			active = false
			match.destroy()
		}
	}, [
		tribe,
		mapSize,
		numberOfOpponents,
		difficulty,
		playerName,
		spectator,
		botDelay,
		initialState,
		commitLocally
	])

	const match = load.kind === 'ready' ? load.match : null
	const subscribe = useCallback(
		(listener: () => void) => match?.subscribe(listener) ?? constVoid,
		[match]
	)
	const getSnapshot = useCallback(() => match?.getState() ?? null, [match])
	const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
	const viewTribe =
		spectator && state ? state.gameState.currentPlayerTribe : tribe
	const view = useMemo(
		() => (state && match ? match.snapshotFor(viewTribe) : null),
		[match, state, viewTribe]
	)
	if (load.kind !== 'ready') {
		return load
	}
	if (!match || !state || !view) {
		return {
			kind: 'failed',
			message:
				'The match view could not be loaded. Reload to restore the last saved turn.'
		}
	}
	return {
		kind: 'ready',
		match,
		viewTribe,
		viewState: view.state,
		gameState: state.gameState
	}
}

function buildOfflineMatch(args: UseOfflineMatchArgs): OfflineMatchHandle {
	const config: MatchConfig = {
		mapSize: args.mapSize,
		turnTimerSeconds: null,
		players: buildOfflinePlayers(args)
	}
	const options: Parameters<typeof createOfflineMatch>[0] = {
		config,
		playerTribe: args.spectator ? null : args.tribe,
		botPacer:
			args.botDelay === 0
				? immediatePacer
				: delayPacer(args.botDelay ?? 500, args.botDelay ?? 300),
		commitLocally: args.commitLocally
	}
	if (args.initialState !== undefined) {
		options.initialState = args.initialState
	}
	return createOfflineMatch(options)
}
