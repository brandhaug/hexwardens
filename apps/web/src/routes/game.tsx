import {
	canFitPlayers,
	mapPlayerCapacity
} from '@hexwardens/game-logic/board/map-capacity'
import { Button } from '@/components/ui/button'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Effect, Predicate, Schema, SchemaGetter } from 'effect'
import { toast } from 'sonner'
import { GameLayout } from '@/components/game/game-layout'
import { ShortcutHelpOverlay } from '@/components/game/shortcut-help-overlay'
import {
	useMatchBroadcastEvents,
	useMatchClientCanAct
} from '@/hooks/use-match-client'
import { useMatchInputs } from '@/hooks/use-match-inputs'
import {
	useOfflineMatch,
	type ReadyOfflineMatch
} from '@/hooks/use-offline-match'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { useUnitCycler } from '@/hooks/unit-cycler'
import { createOfflineMatchClient } from '@/lib/offline-match-client'
import { type ShortcutEntry } from '@/lib/shortcuts/shortcut-registry'
import { type BoardPosition } from '@hexwardens/game-logic/board/board.ts'
import {
	difficulties,
	type Difficulty,
	isDifficulty
} from '@hexwardens/game-logic/difficulty'
import {
	isTribe,
	type Tribe,
	tribes
} from '@hexwardens/game-logic/domains/tribe'
import { mapSizes } from '@hexwardens/game-logic/multiplayer/types'
import { useGameAudio } from '@/hooks/use-game-audio'
import { useMatchMusic } from '@/hooks/use-match-music'
import { toggleMute } from '@/lib/audio-preferences'
import { type SavedMatchLifecycle } from '@/lib/saved-match/saved-match-lifecycle'
import {
	useBrowserSavedMatchLifecycle,
	useSavedMatchGate,
	useSavedMatchSession,
	type SavedMatchSessionHandle
} from '@/lib/saved-match/use-saved-match-lifecycle'
import { type SavedMatchRevision } from '@hexwardens/game-logic/match/saved-match'
import { type MatchState } from '@hexwardens/game-logic/match/types'

const TribeFromUnknown = Schema.Unknown.pipe(
	Schema.decodeTo(Schema.Literals(tribes), {
		decode: SchemaGetter.transform((v: unknown): Tribe =>
			Predicate.isString(v) && isTribe(v) ? v : tribes[0]
		),
		encode: SchemaGetter.transform((t: Tribe) => t)
	})
)

const DifficultyFromUnknown = Schema.Unknown.pipe(
	Schema.decodeTo(Schema.Literals(difficulties), {
		decode: SchemaGetter.transform((v: unknown): Difficulty =>
			Predicate.isString(v) && isDifficulty(v) ? v : 'Beginner'
		),
		encode: SchemaGetter.transform((d: Difficulty) => d)
	})
)

const NumberFromUnknown = Schema.Unknown.pipe(
	Schema.decodeTo(Schema.Finite, {
		decode: SchemaGetter.transform((v: unknown): number =>
			Predicate.isNumber(v) ? v : Number(v)
		),
		encode: SchemaGetter.transform((n: number) => n)
	})
)

const BooleanFromUnknown = Schema.Unknown.pipe(
	Schema.decodeTo(Schema.Boolean, {
		decode: SchemaGetter.transform(Boolean),
		encode: SchemaGetter.transform((b: boolean) => b)
	})
)

const gameSearchParams = Schema.Struct({
	tribe: TribeFromUnknown.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(tribes[0]))
	),
	mapSize: Schema.Literals(mapSizes).pipe(
		Schema.withDecodingDefaultType(Effect.succeed('medium' as const))
	),
	numberOfOpponents: NumberFromUnknown.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(1))
	),
	difficulty: DifficultyFromUnknown.pipe(
		Schema.withDecodingDefaultType(Effect.succeed('Beginner' as const))
	),
	playerName: Schema.String.pipe(
		Schema.withDecodingDefaultType(Effect.succeed('Player 1'))
	),
	spectator: BooleanFromUnknown.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(false))
	),
	botDelay: Schema.optional(NumberFromUnknown),
	fresh: BooleanFromUnknown.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(false))
	)
})

const decodeSearch = Schema.decodeUnknownSync(gameSearchParams)
type GameSearch = typeof gameSearchParams.Type

// Build-initial-state is seeded from `Date.now()` inside the shared init path,
// so the server and client would draw different boards and React would throw a
// hydration mismatch on mount. SSR is disabled for this route until board
// seeding is plumbed through the URL (or a loader).
export const Route = createFileRoute('/game')({
	validateSearch: decodeSearch,
	ssr: false,
	component: GameComponent
})

function GameComponent() {
	const search = Route.useSearch()
	const navigate = useNavigate()
	const lifecycle = useBrowserSavedMatchLifecycle()
	// `fresh=true` is the contract for "I just configured a new game on the
	// menu — ignore any saved match." Anything else has to ask the lifecycle
	// whether there's a resumable match.
	const gate = useSavedMatchGate(lifecycle, { skip: search.fresh })

	useEffect(() => {
		if (gate.kind === 'conflict') {
			// Conflict resolution lives on the single-player gate route, which
			// shares the landing styling; bounce there to resolve it.
			toast.message('Saved Match needs review — choose a version to continue.')
			void navigate({ to: '/single-player' })
			return
		}
		if (gate.kind === 'empty') {
			// No resumable match. Send them to the single-player config form
			// instead of leaving them on /game with nothing to play.
			void navigate({ to: '/single-player-new' })
			return
		}
		if (gate.kind === 'incompatible') {
			// Incompatible resume — surface on the single-player gate route
			// where the user can explicitly start fresh.
			void navigate({ to: '/single-player' })
		}
	}, [gate, navigate])

	if (gate.kind !== 'ready') {
		return (
			<div className='grid min-h-dvh place-items-center bg-background px-4 text-foreground'>
				<output
					aria-live='polite'
					className='rounded-md border border-border bg-card px-5 py-4 font-heading text-sm tracking-[0.12em] uppercase'
				>
					Loading match…
				</output>
			</div>
		)
	}

	if (
		!gate.record &&
		!canFitPlayers(search.mapSize, search.numberOfOpponents + 1)
	) {
		return (
			<div className='grid min-h-dvh place-content-center gap-4 p-6'>
				<p>
					This setup does not fit. {search.mapSize} maps support up to{' '}
					{mapPlayerCapacity[search.mapSize]} players, including you.
				</p>
				<Button onClick={() => void navigate({ to: '/single-player-new' })}>
					Change setup
				</Button>
			</div>
		)
	}

	return (
		<PlayableGameComponent
			search={search}
			lifecycle={lifecycle}
			initialSavedMatch={gate.record}
		/>
	)
}

function PlayableGameComponent({
	search,
	lifecycle,
	initialSavedMatch
}: {
	readonly search: GameSearch
	readonly lifecycle: SavedMatchLifecycle
	readonly initialSavedMatch: SavedMatchRevision | null
}) {
	const { playerName, spectator, botDelay } = search
	// Resuming a Saved Match preserves the stored setup per ADR-0009 — current
	// URL search params only apply when starting a brand-new Match. Using
	// `search.tribe` after a resume would render the board against an empty
	// `playerStates[searchTribe]` entry.
	const tribe = initialSavedMatch?.playerTribe ?? search.tribe
	const mapSize = initialSavedMatch?.mapSize ?? search.mapSize
	const numberOfOpponents =
		initialSavedMatch?.opponentCount ?? search.numberOfOpponents
	const difficulty = initialSavedMatch?.difficulty ?? search.difficulty

	// oxlint-disable-next-line react/hook-use-state -- The save identity is fixed for this mounted match.
	const [savedMatchId] = useState(
		() => initialSavedMatch?.savedMatchId ?? crypto.randomUUID()
	)
	const handleRemoteConflict = useCallback(() => {
		toast.error(
			'Saved Match diverged on another device. Sync paused. Reload to choose a version.'
		)
	}, [])
	const savedMatch = useSavedMatchSession({
		lifecycle,
		savedMatchId,
		playerTribe: tribe,
		difficulty,
		opponentCount: numberOfOpponents,
		initial: initialSavedMatch,
		onRemoteConflict: handleRemoteConflict
	})
	const commitLocally = useCallback(
		(state: MatchState) => savedMatch.recordCommittedState(state),
		[savedMatch]
	)
	const offline = useOfflineMatch({
		tribe,
		mapSize,
		numberOfOpponents,
		difficulty,
		playerName,
		spectator,
		botDelay,
		initialState: initialSavedMatch?.matchState,
		commitLocally
	})
	if (offline.kind !== 'ready') {
		return (
			<div className='grid min-h-dvh place-items-center bg-background px-4 text-foreground'>
				<output aria-live='polite'>
					{offline.kind === 'loading' ? 'Saving match…' : offline.message}
				</output>
			</div>
		)
	}
	return (
		<LiveGameComponent
			search={search}
			tribe={tribe}
			offline={offline}
			savedMatch={savedMatch}
		/>
	)
}

function LiveGameComponent({
	search,
	tribe,
	offline,
	savedMatch
}: {
	readonly search: GameSearch
	readonly tribe: Tribe
	readonly offline: ReadyOfflineMatch
	readonly savedMatch: SavedMatchSessionHandle
}) {
	const navigate = useNavigate()
	const { playerName, spectator } = search
	const { match, viewTribe, viewState, gameState } = offline

	// The adapter publishes accepted actions only after the local durable commit.
	const client = useMemo(
		() => createOfflineMatchClient({ match, tribe, spectator }),
		[match, tribe, spectator]
	)
	const broadcastEvents = useMatchBroadcastEvents(client)

	useGameAudio({
		state: viewState,
		localTribe: spectator ? null : tribe,
		broadcastEvents
	})
	useMatchMusic('match')

	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(null)
	const [isHelpOpen, setIsHelpOpen] = useState(false)

	// oxlint-disable-next-line react-doctor/no-effect-event-handler -- Direct URL visits also start matches; consume the creation flag after the save session mounts.
	useEffect(() => {
		if (search.fresh) {
			// Fresh applies only to this mount. Reloads must resume the match
			// now being persisted by the saved-match session above.
			void navigate({
				to: '/game',
				search: { ...search, fresh: false },
				replace: true,
				resetScroll: false
			})
		}
	}, [navigate, search])

	const canAct = useMatchClientCanAct(client)

	const cycler = useUnitCycler({
		gameState,
		tribe: viewTribe,
		selectedTile,
		onSelect: setSelectedTile
	})

	const {
		handleTileSelect,
		handleCombat,
		handleMovement,
		handleAction,
		endTurnArmed,
		handleEndTurn,
		handleNextUnit,
		inGameShortcuts
	} = useMatchInputs({
		gameState,
		tribe: viewTribe,
		client,
		cycler,
		selectedTile,
		setSelectedTile
	})

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) {
			void document.exitFullscreen()
		} else {
			void document.documentElement.requestFullscreen()
		}
	}, [])

	const openHelp = useCallback(() => setIsHelpOpen(true), [])
	const closeHelp = useCallback(() => setIsHelpOpen(false), [])
	const handleGameOverPlayAgain = useCallback(async () => {
		// Wait for the tombstone to land in both stores before navigating —
		// otherwise the remote PUT can be cancelled on unload and a second
		// device may resurrect this completed Match. The ADR's "deletes are
		// tombstone revisions" guarantee depends on this write.
		await savedMatch.acknowledgeDeleted()
		await navigate({ to: '/' })
	}, [navigate, savedMatch])

	const shortcutRegistry = useMemo<ShortcutEntry[]>(
		() => [
			...inGameShortcuts,
			{
				code: 'KeyF',
				description: 'Toggle fullscreen',
				scope: 'always',
				category: 'System',
				handler: toggleFullscreen
			},
			{
				code: 'KeyM',
				description: 'Toggle mute',
				scope: 'always',
				category: 'System',
				handler: toggleMute
			},
			{
				code: 'Slash',
				shift: true,
				description: 'Show keyboard shortcuts',
				scope: 'always',
				category: 'System',
				handler: openHelp
			},
			{
				code: 'Escape',
				description: 'Close dialog',
				scope: 'inMenu',
				handler: closeHelp
			}
		],
		[inGameShortcuts, toggleFullscreen, openHelp, closeHelp]
	)
	const shortcutContext = useMemo(
		() => ({ scope: isHelpOpen ? ('inMenu' as const) : ('inGame' as const) }),
		[isHelpOpen]
	)
	useShortcuts(shortcutRegistry, shortcutContext)

	return (
		<>
			<GameLayout
				gameState={gameState}
				playerTribe={viewTribe}
				playerName={playerName}
				selectedTile={selectedTile}
				isInteractive={canAct}
				onTileSelect={handleTileSelect}
				onCombat={handleCombat}
				onMovement={handleMovement}
				onAction={handleAction}
				endTurnArmed={endTurnArmed}
				onEndTurn={handleEndTurn}
				readyUnitCount={cycler.readyUnitCount}
				onNextUnit={handleNextUnit}
				onOpenHelp={openHelp}
				onGameOverPlayAgain={() => void handleGameOverPlayAgain()}
			/>
			{isHelpOpen && (
				<ShortcutHelpOverlay registry={shortcutRegistry} onClose={closeHelp} />
			)}
		</>
	)
}
