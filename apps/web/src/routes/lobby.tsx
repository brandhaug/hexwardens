import { TribeOpeningPreview } from '@/components/lobby/tribe-opening-preview'
import { mapPlayerCapacity } from '@hexwardens/game-logic/board/map-capacity'
import { constVoid } from 'effect/Function'
import { Result, Schema } from 'effect'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
	useLayoutEffect,
	useEffectEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { tribes, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	createGameClient,
	type GameClient,
	type LobbyState,
	createLobby,
	joinPublicQueue,
	joinLobby,
	storeGameCredentials
} from '@/lib/game-client'
import { presentLobby } from '@/lib/lobby/lobby-presentation'
import { getRecentTribe, rememberTribe } from '@/lib/lobby/recent-tribe'
import { getGameToken } from '@/lib/game.functions'
import { LandingShell } from '@/components/landing-shell'
import { DailyChallengeBriefing } from '@/components/lobby/daily-challenge-briefing'
import { InviteToken } from '@/components/lobby/invite-token'
import { LobbySeat } from '@/components/lobby/lobby-seat'
import { MatchPreview } from '@/components/lobby/match-preview'
import { TribeBanner } from '@/components/lobby/tribe-banner'
import { haptic } from '@/lib/haptics'
import { toast } from 'sonner'

const lobbySearchParams = Schema.Struct({
	inviteCode: Schema.optional(Schema.String),
	action: Schema.optional(Schema.Literals(['create', 'join', 'queue']))
})

const decodeSearch = Schema.decodeUnknownSync(lobbySearchParams)

export const Route = createFileRoute('/lobby')({
	validateSearch: decodeSearch,
	loader: () => getGameToken(),
	component: LobbyComponent
})

const TURN_TIMER_OPTIONS = ['60', '90', '120', 'unlimited'] as const

function useLobbyConnection() {
	const { inviteCode: initialInviteCode, action } = Route.useSearch()
	const { token, serverUrl } = Route.useLoaderData()
	const navigate = useNavigate()

	const [lobby, setLobby] = useState<LobbyState | null>(null)
	const [playerId, setPlayerId] = useState<string | null>(null)
	const [joinCode, setJoinCode] = useState(initialInviteCode ?? '')
	const [isConnecting, setIsConnecting] = useState(false)
	const [matchStarted, setMatchStarted] = useState<string | null>(null)

	const wsRef = useRef<GameClient | null>(null)
	const connectionPendingRef = useRef(false)
	const mountedRef = useRef(false)
	const matchStartedRef = useRef(matchStarted)
	const publicQueueStartRequestedRef = useRef(false)
	useLayoutEffect(() => {
		matchStartedRef.current = matchStarted
	}, [matchStarted])

	const recentTribe = useMemo(() => getRecentTribe(), [])

	const connectToLobby = useCallback(
		(lobbyId: string) => {
			const client = createGameClient({
				handlers: {
					lobbyUpdate: (msg) => {
						setLobby(msg.lobby)
						if (
							msg.lobby.kind === 'publicQueue' &&
							msg.lobby.slots.length >= msg.lobby.config.maxPlayers &&
							!publicQueueStartRequestedRef.current
						) {
							publicQueueStartRequestedRef.current = true
							client.startGame()
						}
					},
					gameStart: (msg) => {
						setMatchStarted(msg.matchId)
					},
					error: (msg) => {
						toast.error(msg.message)
					},
					// Not expected during lobby phase — no-ops.
					gameState: constVoid,
					actionResult: constVoid,
					playerForfeited: constVoid,
					gameEnd: constVoid,
					turnTimerUpdate: constVoid,
					turnEvents: constVoid,
					chronicleEntries: constVoid,
					achievementsUnlocked: constVoid
				},
				onClose: () => {
					if (!matchStartedRef.current) {
						toast.error('Disconnected from lobby')
					}
				}
			})
			client.connectToLobby(serverUrl, lobbyId, token)
			wsRef.current = client
		},
		[token, serverUrl]
	)

	useEffect(() => {
		if (matchStarted) {
			storeGameCredentials({ token, serverUrl })
			void navigate({
				to: '/multiplayer-game',
				search: { matchId: matchStarted }
			})
		}
	}, [matchStarted, navigate, token, serverUrl])

	useEffect(() => {
		mountedRef.current = true
		return () => {
			mountedRef.current = false
			wsRef.current?.disconnect()
		}
	}, [])

	const handleCreate = async () => {
		if (connectionPendingRef.current) {
			return
		}
		connectionPendingRef.current = true
		setIsConnecting(true)
		const result = await createLobby(serverUrl, token)
		connectionPendingRef.current = false
		if (!mountedRef.current) {
			return
		}
		if (Result.isSuccess(result)) {
			setPlayerId(result.success.playerId)
			connectToLobby(result.success.lobbyId)
		} else {
			toast.error('Failed to create lobby')
		}
		setIsConnecting(false)
	}

	const handleJoin = async () => {
		if (connectionPendingRef.current) {
			return
		}
		if (!joinCode.trim()) {
			toast.error('Enter an invite code')
			return
		}
		connectionPendingRef.current = true
		setIsConnecting(true)
		const result = await joinLobby(serverUrl, token, joinCode.trim())
		connectionPendingRef.current = false
		if (!mountedRef.current) {
			return
		}
		if (Result.isSuccess(result)) {
			setPlayerId(result.success.playerId)
			connectToLobby(result.success.lobbyId)
		} else {
			toast.error('Failed to join lobby')
		}
		setIsConnecting(false)
	}

	const handlePublicQueue = async () => {
		if (connectionPendingRef.current) {
			return
		}
		connectionPendingRef.current = true
		setIsConnecting(true)
		const result = await joinPublicQueue(serverUrl, token)
		connectionPendingRef.current = false
		if (!mountedRef.current) {
			return
		}
		if (Result.isSuccess(result)) {
			setPlayerId(result.success.playerId)
			if (result.success.matchId) {
				storeGameCredentials({ token, serverUrl })
				void navigate({
					to: '/multiplayer-game',
					search: { matchId: result.success.matchId }
				})
			} else {
				connectToLobby(result.success.lobbyId)
			}
		} else {
			toast.error('Failed to join public queue')
		}
		setIsConnecting(false)
	}

	const performInitialAction = useEffectEvent(() => {
		if (action === 'create' && !lobby && !isConnecting) {
			void handleCreate()
		} else if (action === 'queue' && !lobby && !isConnecting) {
			void handlePublicQueue()
		} else if (
			action === 'join' &&
			initialInviteCode &&
			!lobby &&
			!isConnecting
		) {
			void handleJoin()
		}
	})
	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect -- This mount effect starts asynchronous loading; the state update is part of the load lifecycle.
		performInitialAction()
	}, [])

	return {
		lobby,
		playerId,
		joinCode,
		setJoinCode,
		isConnecting,
		wsRef,
		recentTribe,
		handlePublicQueue,
		handleCreate,
		handleJoin
	}
}

function LobbyComponent() {
	const {
		lobby,
		playerId,
		joinCode,
		setJoinCode,
		isConnecting,
		wsRef,
		recentTribe,
		handlePublicQueue,
		handleCreate,
		handleJoin
	} = useLobbyConnection()

	if (!lobby) {
		return (
			<LandingShell>
				<Card className='w-full max-w-[420px]'>
					<CardHeader>
						<CardTitle>Multiplayer</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<Button
							onClick={() => void handlePublicQueue()}
							disabled={isConnecting}
							data-press='gold'
							className='h-12 w-full text-base'
						>
							{isConnecting ? 'Searching…' : 'Join public queue'}
						</Button>
						<Button
							onClick={() => void handleCreate()}
							disabled={isConnecting}
							data-press='teal'
							variant='secondary'
							className='h-12 w-full text-base'
						>
							{isConnecting ? 'Creating…' : 'Create private lobby'}
						</Button>
						<div className='flex items-center gap-2'>
							<div className='h-px flex-1 bg-border' />
							<span className='font-heading text-[0.65rem] text-muted-foreground uppercase tracking-[0.2em]'>
								or
							</span>
							<div className='h-px flex-1 bg-border' />
						</div>
						<div className='space-y-2'>
							<Label htmlFor='lobby-invite-code'>Invite code</Label>
							<div className='flex gap-2'>
								<Input
									id='lobby-invite-code'
									value={joinCode}
									onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
									placeholder='ABCD12'
									maxLength={6}
									autoComplete='off'
									autoCapitalize='characters'
									spellCheck={false}
									className='h-11 font-heading text-center tracking-[0.4em] uppercase'
								/>
								<Button
									onClick={() => void handleJoin()}
									disabled={isConnecting || !joinCode.trim()}
									data-press='teal'
									className='h-11 px-5'
								>
									Join
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</LandingShell>
		)
	}

	const view = presentLobby(lobby, playerId)
	const { localSeat, isHost, takenTribes, readinessSummary } = view
	const isPublicQueue = lobby.kind === 'publicQueue'

	const handleTribeSelect = (tribe: Tribe) => {
		if (takenTribes.has(tribe) && localSeat?.tribe !== tribe) {
			return
		}
		wsRef.current?.setTribe(tribe)
		rememberTribe(tribe)
	}

	return (
		<LandingShell>
			<Card className='w-full max-w-[720px]'>
				<CardHeader>
					<div className='flex flex-wrap items-start justify-between gap-3'>
						<div className='flex flex-col gap-1'>
							<CardTitle>
								{isPublicQueue ? 'Public queue' : 'Gather the table'}
							</CardTitle>
							<p className='text-xs text-muted-foreground'>
								{isPublicQueue
									? `${lobby.slots.length} of ${lobby.config.maxPlayers} players found`
									: `${readinessSummary.ready} of ${readinessSummary.total} players ready`}
							</p>
						</div>
						{!isPublicQueue && <InviteToken code={lobby.inviteCode} />}
					</div>
				</CardHeader>
				<CardContent className='space-y-6'>
					{isPublicQueue && <DailyChallengeBriefing />}

					<MatchPreview
						config={lobby.config}
						playerCount={lobby.slots.length}
					/>

					{/* Seats / banners */}
					<section className='space-y-2'>
						<Label>Players at the table</Label>
						<div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
							{view.seats.map((seat) => (
								<LobbySeat
									key={
										seat.kind === 'player'
											? seat.slot.playerId
											: `empty-${seat.seatIndex}`
									}
									seat={seat}
								/>
							))}
						</div>
					</section>

					{/* Tribe selection */}
					{localSeat && !localSeat.isBot && !isPublicQueue && (
						<section className='space-y-2'>
							<Label>Choose your tribe</Label>
							<TribeOpeningPreview tribe={localSeat.tribe} />
							<div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
								{tribes.map((t) => (
									<TribeBanner
										key={t}
										tribe={t}
										selected={localSeat.tribe === t}
										disabled={takenTribes.has(t) && localSeat.tribe !== t}
										suggested={recentTribe === t}
										onSelect={() => handleTribeSelect(t)}
									/>
								))}
							</div>
						</section>
					)}

					{/* Host controls */}
					{isHost && !isPublicQueue && (
						<section className='space-y-3 rounded-lg border border-border bg-muted/20 p-3'>
							<Label className='text-xs font-semibold uppercase tracking-wider'>
								Host settings
							</Label>
							<div className='space-y-2'>
								<Label className='text-xs'>Map size</Label>
								<p className='text-xs text-muted-foreground'>
									Small: 3 players · Medium: 4 · Large: 5
								</p>
								<ToggleGroup
									aria-label='Map size'
									value={[lobby.config.mapSize]}
									onValueChange={(values) => {
										const v = values[0]
										if (v === 'small' || v === 'medium' || v === 'large') {
											wsRef.current?.configureLobby({
												mapSize: v,
												maxPlayers: mapPlayerCapacity[v]
											})
										}
									}}
									className='flex flex-wrap gap-1'
								>
									<ToggleGroupItem
										value='small'
										disabled={lobby.slots.length > mapPlayerCapacity['small']}
										className='min-h-11 flex-1 sm:min-h-9'
									>
										Small
									</ToggleGroupItem>
									<ToggleGroupItem
										value='medium'
										disabled={lobby.slots.length > mapPlayerCapacity['medium']}
										className='min-h-11 flex-1 sm:min-h-9'
									>
										Medium
									</ToggleGroupItem>
									<ToggleGroupItem
										value='large'
										disabled={lobby.slots.length > mapPlayerCapacity['large']}
										className='min-h-11 flex-1 sm:min-h-9'
									>
										Large
									</ToggleGroupItem>
								</ToggleGroup>
							</div>
							<div className='space-y-2'>
								<Label className='text-xs'>Turn timer</Label>
								<ToggleGroup
									value={[String(lobby.config.turnTimerSeconds ?? 'unlimited')]}
									onValueChange={(values) => {
										const v = values[0]
										if (!v) {
											return
										}
										const seconds = v === 'unlimited' ? null : Number(v)
										wsRef.current?.configureLobby({
											turnTimerSeconds: seconds
										})
									}}
									className='flex flex-wrap gap-1'
								>
									{TURN_TIMER_OPTIONS.map((opt) => (
										<ToggleGroupItem
											key={opt}
											value={opt}
											className='min-h-11 flex-1 sm:min-h-9'
										>
											{opt === 'unlimited' ? 'Unlimited' : `${opt}s`}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</div>
						</section>
					)}
				</CardContent>
				<LobbyFooter
					view={view}
					isPublicQueue={isPublicQueue}
					clientRef={wsRef}
				/>
			</Card>
		</LandingShell>
	)
}

function LobbyFooter({
	view,
	isPublicQueue,
	clientRef
}: {
	view: ReturnType<typeof presentLobby>
	isPublicQueue: boolean
	clientRef: React.RefObject<GameClient | null>
}) {
	const navigate = useNavigate()
	const { localSeat, isHost, canStart } = view
	return (
		<CardFooter
			className='flex flex-wrap gap-2'
			style={{
				paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))'
			}}
		>
			<Button
				variant='outline'
				className='h-11 sm:h-9'
				onClick={() => {
					clientRef.current?.disconnect()
					void navigate({ to: '/' })
				}}
			>
				Leave
			</Button>
			<div className='hidden flex-1 sm:block' />
			{localSeat && !localSeat.isBot && !isPublicQueue && (
				<Button
					variant={localSeat.isReady ? 'outline' : 'default'}
					data-press={localSeat.isReady ? undefined : 'gold'}
					className='h-12 flex-1 font-heading text-base uppercase tracking-[0.06em] sm:h-10 sm:flex-none'
					onClick={() => {
						haptic('tap')
						clientRef.current?.setReady(!localSeat.isReady)
					}}
					disabled={!localSeat.tribe}
				>
					{localSeat.isReady ? 'Unready' : 'Ready up'}
				</Button>
			)}
			{isHost && !isPublicQueue && (
				<Button
					data-press='gold'
					className='h-12 flex-1 font-heading text-base uppercase tracking-[0.06em] sm:h-10 sm:flex-none'
					onClick={() => {
						haptic('commit')
						clientRef.current?.startGame()
					}}
					disabled={!canStart}
				>
					Start match
				</Button>
			)}
		</CardFooter>
	)
}
