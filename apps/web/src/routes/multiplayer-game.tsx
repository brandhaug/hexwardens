import { constVoid } from 'effect/Function'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { AlertTriangle, Radio, RotateCcw } from 'lucide-react'
import {
	useLayoutEffect,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react'
import { DailyChallengeHud } from '@/components/game/daily-challenge-hud'
import { GameLayout } from '@/components/game/game-layout'
import { type DailyChallengeOutcome } from '@/components/game/game-over-overlay'
import {
	useChronicleAccumulator,
	useFilteredChronicleEntries
} from '@/hooks/use-chronicle'
import {
	useMatchBroadcastEvents,
	useMatchClientCanAct,
	useMatchClientGameState
} from '@/hooks/use-match-client'
import { useMatchInputs } from '@/hooks/use-match-inputs'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { useUnitCycler } from '@/hooks/unit-cycler'
import { type BoardPosition } from '@hexwardens/game-logic/board/board.ts'
import { DAILY_CHALLENGE_REGISTRY } from '@hexwardens/game-logic/daily-challenge/registry'
import { dailyChallengeForDate } from '@hexwardens/game-logic/daily-challenge/rotation'
import { todayDailyDate } from '@hexwardens/game-logic/daily-challenge/seed'
import { tribeToColor, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { getCurrentPlayerState } from '@hexwardens/game-logic/player/player-state'
import {
	createGameClient,
	type GameClient,
	type GameConnectionStatus,
	getStoredGameCredentials
} from '@/lib/game-client'
import {
	createMultiplayerMatchClient,
	type MultiplayerMatchClient
} from '@/lib/multiplayer-match-client'
import { connectionStatusPresentation } from '@/lib/game-connection-status'
import { getGameToken } from '@/lib/game.functions'
import { useGameAudio } from '@/hooks/use-game-audio'
import { useMatchMusic } from '@/hooks/use-match-music'
import { showAchievementUnlockToasts } from '@/lib/show-achievement-toast'
import { useTurnTimer } from '@/lib/use-turn-timer'
import { TurnTimerRing } from '@/components/game/turn-timer-ring'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const searchParams = Schema.Struct({
	matchId: Schema.String
})

const decodeSearch = Schema.decodeUnknownSync(searchParams)

const shortcutContext = { scope: 'inGame' as const }

export const Route = createFileRoute('/multiplayer-game')({
	validateSearch: decodeSearch,
	// Guest match credentials belong to this browser tab, including reloads.
	ssr: false,
	loader: async () => {
		const stored = getStoredGameCredentials()
		if (stored) {
			return stored
		}
		return getGameToken()
	},
	component: MultiplayerGameComponent
})

function MultiplayerGameComponent() {
	const { matchId } = Route.useSearch()
	const { token, serverUrl } = Route.useLoaderData()

	const wsRef = useRef<GameClient | null>(null)

	// The MatchClient seam: multiplayer adapter over the WebSocket transport.
	// It owns the optimistic-apply overlay (local dispatch for immediate
	// feedback, eager send, single-flight lock until server ack — ADR-0010);
	// the route keeps connection lifecycle, timers, chronicle, and toasts.
	// oxlint-disable-next-line react/refs, react/hook-use-state -- The transport callbacks read the socket only when invoked after mount.
	const [matchClient] = useState<MultiplayerMatchClient>(() =>
		createMultiplayerMatchClient({
			transport: {
				send: (msg) => wsRef.current?.send(msg),
				endTurn: () => wsRef.current?.endTurn()
			},
			onIntentRejected: (message) => toast.error(message)
		})
	)
	// Effective state for the local viewer: the server projection with any
	// in-flight optimistic overlay applied. Server-trusted fog — never
	// re-derived client-side.
	const gameState = useMatchClientGameState(matchClient)

	const [myTribe, setMyTribe] = useState<Tribe | null>(null)
	// Handlers below live inside the connection effect, which must not
	// re-run when the viewer's tribe arrives — read it through a ref.
	const myTribeRef = useRef(myTribe)
	useLayoutEffect(() => {
		myTribeRef.current = myTribe
	}, [myTribe])
	const [currentTurn, setCurrentTurn] = useState<Tribe | null>(null)
	const [turnEndsAt, setTurnEndsAt] = useState<number | null>(null)
	const [turnTotalMs, setTurnTotalMs] = useState<number | null>(null)
	const [connectionStatus, setConnectionStatus] =
		useState<GameConnectionStatus>({
			state: 'connecting',
			lastMessageAt: null,
			lastServerSequence: null
		})
	const turnEndsAtRef = useRef(turnEndsAt)
	useLayoutEffect(() => {
		turnEndsAtRef.current = turnEndsAt
	}, [turnEndsAt])

	// Match chronicle accumulator. We fold incoming `turnEvents` server
	// messages into a rolling chronicle, then fog-filter for the local
	// viewer. The hook stores raw entries; visibility happens at render.
	const { chronicle, append: appendChronicle } = useChronicleAccumulator()
	const ingestTimer = useCallback((endsAt: number | null) => {
		if (endsAt === null) {
			setTurnEndsAt(null)
			setTurnTotalMs(null)
			return
		}
		if (endsAt !== turnEndsAtRef.current) {
			setTurnTotalMs(Math.max(0, endsAt - Date.now()))
		}
		setTurnEndsAt(endsAt)
	}, [])

	useEffect(() => {
		const client = createGameClient({
			handlers: {
				gameState: (msg) => {
					// Server-confirmed state — the adapter swaps in the authoritative
					// projection and drops any optimistic overlay so the next click
					// can fire and downstream renders see authoritative fog reveal.
					matchClient.receiveGameState(msg)
					setCurrentTurn(msg.currentTurn)
					ingestTimer(msg.turnEndsAt)

					if (!myTribeRef.current) {
						setMyTribe(msg.viewer)
					}
				},
				actionResult: (msg) => {
					// Rollback lives in the adapter (discard the optimistic apply,
					// unlock new clicks — no server `gameState` push follows a
					// rejection); surfacing the rejection stays a route concern.
					matchClient.receiveActionResult(msg)
					if (!msg.success) {
						toast.error(msg.message)
					}
				},
				playerForfeited: (msg) => {
					toast.info(`${msg.username} (${msg.tribe}) has forfeited`)
				},
				gameEnd: (msg) => {
					if (msg.result.winner) {
						toast.success(`${msg.result.winner} wins!`)
					} else {
						toast.info('Game ended in a draw')
					}
				},
				error: (msg) => {
					toast.error(msg.message)
				},
				turnTimerUpdate: (msg) => {
					ingestTimer(msg.turnEndsAt)
				},
				turnEvents: (msg) => {
					matchClient.receiveTurnEvents(msg.events)
				},
				chronicleEntries: (msg) => {
					appendChronicle(msg.entries)
				},
				lobbyUpdate: constVoid,
				gameStart: constVoid,
				achievementsUnlocked: (msg) => {
					const tribe = myTribeRef.current
					if (tribe !== null && msg.tribe !== tribe) {
						return
					}
					showAchievementUnlockToasts(msg.achievementIds)
				}
			},
			onClose: () => {
				toast.error('Disconnected from game')
			},
			onValidationError: (error) => {
				toast.error(
					`Server payload rejected — fog-of-war leak at ${error.path.join('.')}`
				)
			},
			onStatusChange: setConnectionStatus
		})

		client.connectToMatch(serverUrl, matchId, token)
		wsRef.current = client

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible' && !client.isConnected()) {
				client.reconnect()
			}
		}
		document.addEventListener('visibilitychange', onVisibilityChange)

		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange)
			client.disconnect()
		}
	}, [matchId, token, serverUrl, ingestTimer, appendChronicle, matchClient])

	const timer = useTurnTimer(turnEndsAt, turnTotalMs)

	if (!gameState || !myTribe) {
		return (
			<div className='flex h-dvh w-full items-center justify-center'>
				<ConnectionStatusPlaque
					status={connectionStatus}
					onReconnect={() => wsRef.current?.reconnect()}
				/>
			</div>
		)
	}

	return (
		<MatchView
			client={matchClient}
			gameState={gameState}
			myTribe={myTribe}
			currentTurn={currentTurn}
			timer={timer}
			wsRef={wsRef}
			chronicle={chronicle}
			connectionStatus={connectionStatus}
		/>
	)
}

interface MatchViewProps {
	/** The MatchClient seam — intent submission, act-gating, broadcast events. */
	client: MultiplayerMatchClient
	/**
	 * Effective state from the client: server projection with any in-flight
	 * optimistic overlay applied.
	 */
	gameState: GameState
	myTribe: Tribe
	currentTurn: Tribe | null
	timer: ReturnType<typeof useTurnTimer>
	wsRef: React.RefObject<GameClient | null>
	chronicle: ReturnType<typeof useChronicleAccumulator>['chronicle']
	connectionStatus: GameConnectionStatus
}

function MatchView({
	client,
	gameState,
	myTribe,
	currentTurn,
	timer,
	wsRef,
	chronicle,
	connectionStatus
}: MatchViewProps) {
	const isMyTurn = currentTurn === myTribe
	// `false` while the player's last Action is pending server ack
	// (single-flight lock) or it's an opponent's Turn.
	const canAct = useMatchClientCanAct(client)
	const broadcastEvents = useMatchBroadcastEvents(client)

	useGameAudio({
		state: gameState,
		localTribe: myTribe,
		broadcastEvents
	})
	useMatchMusic('match')

	const [selectedTile, setSelectedTile] = useState<BoardPosition | null>(null)

	// Fog-filter the chronicle for the local viewer. The accumulator stores
	// raw entries; visibility is applied at render so a re-fog (e.g. after a
	// state update reveals new tiles) flows through naturally.
	const chronicleEntries = useFilteredChronicleEntries(
		chronicle,
		myTribe,
		gameState
	)

	// Mirror the server's Daily Challenge evaluation over the chronicle the
	// client already has. The chip renders during play; the same projection
	// feeds the Match-end recap so the overlay shows authoritative-shaped
	// data the moment the game ends. Server is the final word on what's
	// recorded — this is cosmetic.
	const dailyChallenge = useMemo(() => {
		const id = dailyChallengeForDate(todayDailyDate())
		return DAILY_CHALLENGE_REGISTRY[id]
	}, [])

	const dailyProgress = useMemo(
		() => dailyChallenge.evaluate(chronicleEntries, myTribe),
		[dailyChallenge, chronicleEntries, myTribe]
	)

	const dailyOutcome: DailyChallengeOutcome = useMemo(
		() => ({
			challengeName: dailyChallenge.name,
			completed: dailyProgress.completed,
			completedAtTurn: dailyProgress.completedAtTurn,
			target: dailyChallenge.target
		}),
		[dailyChallenge, dailyProgress]
	)

	const navigate = useNavigate()
	const handleQuit = useCallback(() => {
		// Multiplayer "quit" disconnects the WebSocket (server treats the
		// dropped session as a forfeit per the match-end rules) and returns
		// the player to the home menu.
		wsRef.current?.disconnect()
		void navigate({ to: '/' })
	}, [navigate, wsRef])

	const cycler = useUnitCycler({
		gameState,
		tribe: myTribe,
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
		tribe: myTribe,
		client,
		cycler,
		selectedTile,
		setSelectedTile
	})

	useShortcuts(inGameShortcuts, shortcutContext)

	const turnIndicator = isMyTurn ? null : (
		<div className='pointer-events-none fixed inset-x-0 top-14 flex justify-center'>
			<div className='pointer-events-auto flex items-center gap-3 rounded-lg border border-border/60 bg-card/95 py-2 pr-4 pl-2 shadow-lg'>
				<TurnTimerRing
					secondsRemaining={timer?.secondsRemaining ?? null}
					totalSeconds={timer?.totalSeconds ?? null}
					outline='circle'
					inset={6}
					strokeWidth={2}
					label={`${currentTurn ?? 'Opponent'} turn time`}
				>
					<div
						className={cn(
							'size-4 rounded-full border border-white/70 shadow-inner',
							currentTurn ? tribeToColor[currentTurn] : 'bg-muted'
						)}
						aria-hidden='true'
					/>
				</TurnTimerRing>
				<span className='font-heading text-sm tracking-wide text-foreground/90'>
					Waiting for{' '}
					<span className='capitalize text-primary'>{currentTurn}</span>
				</span>
			</div>
		</div>
	)

	return (
		<>
			<GameLayout
				gameState={gameState}
				playerTribe={myTribe}
				playerName={getCurrentPlayerState(gameState.playerStates, myTribe).name}
				selectedTile={selectedTile}
				isInteractive={canAct}
				overlay={turnIndicator}
				turnTimer={isMyTurn ? timer : null}
				onTileSelect={handleTileSelect}
				onCombat={handleCombat}
				onMovement={handleMovement}
				onAction={handleAction}
				endTurnArmed={endTurnArmed}
				onEndTurn={handleEndTurn}
				readyUnitCount={cycler.readyUnitCount}
				onNextUnit={handleNextUnit}
				onQuit={handleQuit}
				dailyOutcome={dailyOutcome}
			/>
			<DailyChallengeHud entries={chronicleEntries} viewer={myTribe} />
			<ConnectionStatusPlaque
				status={connectionStatus}
				onReconnect={() => wsRef.current?.reconnect()}
			/>
		</>
	)
}

function ConnectionStatusPlaque({
	status,
	onReconnect
}: {
	status: GameConnectionStatus
	onReconnect: () => void
}) {
	const presentation = connectionStatusPresentation(status)
	if (!presentation) {
		return null
	}

	const isDanger = presentation.tone === 'danger'
	const isWarning = presentation.tone === 'warning'
	const normalBorder = isWarning ? 'border-primary/55' : 'border-border/70'
	const normalIcon = isWarning
		? 'border-primary/40 bg-primary/15 text-primary'
		: 'border-border bg-muted/50 text-muted-foreground'

	return (
		<div className='pointer-events-none fixed inset-x-0 top-4 z-30 flex justify-center px-3'>
			<div
				className={cn(
					'pointer-events-auto flex max-w-[min(92vw,28rem)] items-center gap-3 rounded-lg border bg-card/95 px-3 py-2 text-card-foreground shadow-xl',
					isDanger ? 'border-destructive/60' : normalBorder
				)}
				role={isDanger ? 'alert' : 'status'}
			>
				<div
					className={cn(
						'flex size-8 shrink-0 items-center justify-center rounded-md border',
						isDanger
							? 'border-destructive/40 bg-destructive/15 text-destructive'
							: normalIcon
					)}
					aria-hidden='true'
				>
					{isDanger ? (
						<AlertTriangle className='size-4' />
					) : (
						<Radio className='size-4' />
					)}
				</div>
				<div className='min-w-0 flex-1'>
					<div className='font-heading text-sm font-semibold tracking-wide'>
						{presentation.title}
					</div>
					<div className='truncate text-muted-foreground text-xs'>
						{presentation.detail}
					</div>
				</div>
				{presentation.actionLabel && (
					<button
						type='button'
						onClick={onReconnect}
						className='inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 font-heading text-[0.7rem] font-semibold tracking-wide hover:bg-muted'
					>
						<RotateCcw className='size-3.5' aria-hidden='true' />
						{presentation.actionLabel}
					</button>
				)}
			</div>
		</div>
	)
}
