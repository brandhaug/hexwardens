import { totalVillageSalary } from '@hexwardens/game-logic/domains/village-income'
import { Bot, Coins, FlaskConical, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MenuButton } from '@/components/game/menu-button'
import { TribeIcon } from '@/components/game/tribe-icon'
import { TurnTimerRing } from '@/components/game/turn-timer-ring'
import { Logo } from '@/components/logo'
import { tribeToColor, type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { getCurrentPlayerState } from '@hexwardens/game-logic/player/player-state'
import { type TurnTimerSnapshot } from '@/lib/use-turn-timer'
import { capitalize, cn } from '@/lib/utils'

interface TopBarProps {
	gameState: GameState
	turn: number
	playerName: string
	playerTribe: Tribe
	turnTimer?: TurnTimerSnapshot | null
	endTurnArmed: boolean
	onEndTurn: () => void
	onQuit?: (() => void) | undefined
	onOpenHelp?: (() => void) | undefined
	onReplayTutorial: () => void
}

export function TopBar({
	gameState,
	turn,
	playerName,
	playerTribe,
	turnTimer,
	endTurnArmed,
	onEndTurn,
	onQuit,
	onOpenHelp,
	onReplayTutorial
}: TopBarProps) {
	const displayPlayer = getCurrentPlayerState(
		gameState.playerStates,
		gameState.currentPlayerTribe
	)

	const endTurnLabel = endTurnArmed ? 'Confirm?' : 'End Turn'

	return (
		<header
			data-game-chrome
			className='hud-edge-top safe-top safe-x relative shrink-0 border-b border-border bg-accent text-foreground'
		>
			<div className='flex items-center justify-between gap-2 px-1 pb-2 md:px-5 md:pb-3'>
				{/* Left cluster — identity + resources */}
				<div className='flex min-w-0 items-center gap-2 md:gap-4'>
					<a
						href='/'
						className='hidden shrink-0 items-center md:flex'
						title='Hexwardens'
						aria-label='Hexwardens — home'
					>
						<Logo className='size-8' />
					</a>

					{/* Identity: a tribe-tinted chip carrying the tribe icon — the
					    crest IS the identity, not a generic dot. */}
					<div className='flex items-center gap-2 md:gap-3'>
						<div className='relative shrink-0'>
							<div
								className={cn(
									'flex size-10 items-center justify-center rounded-md border-2 border-gold-edge text-gold-edge shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_2px_0_rgba(0,0,0,0.32)] md:size-9',
									tribeToColor[displayPlayer.tribe]
								)}
								aria-label={`Current turn: ${displayPlayer.tribe}`}
							>
								<TribeIcon
									tribe={displayPlayer.tribe}
									className='size-6 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] md:size-5'
								/>
							</div>
							{displayPlayer.isBot && (
								<Bot
									className='-bottom-1 -right-1 absolute size-4 rounded-full bg-teal-card p-0.5 text-gold-edge ring-1 ring-gold-edge/60'
									aria-label='Bot'
								/>
							)}
						</div>
						<div className='hidden min-w-0 flex-col leading-tight sm:flex'>
							<span className='truncate font-semibold text-gold-edge text-sm'>
								{displayPlayer.isBot ? displayPlayer.name : playerName}
							</span>
							<span className='font-heading text-[0.6rem] uppercase tracking-[0.18em] text-teal-mist/85'>
								{displayPlayer.tribe}
							</span>
						</div>
					</div>

					<div
						aria-hidden
						className='hidden h-9 w-px bg-linear-to-b from-transparent via-teal-mist/30 to-transparent sm:block'
					/>

					{/* Gold chip — the only resource on the HUD. Sculpted, tabular,
					    immediately readable. */}
					<div className='flex h-9 items-center gap-1.5 rounded-md border border-gold-edge/55 bg-linear-to-b from-chip-top to-chip-bottom px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_0_var(--chip-cast)] md:gap-2 md:px-3'>
						<Coins
							className='size-4 text-gold-bright drop-shadow-[0_1px_0_rgba(0,0,0,0.35)] md:size-5'
							aria-hidden='true'
						/>
						<span className='font-bold font-heading tabular-nums text-gold-edge text-sm leading-none md:text-base'>
							<span className='sr-only'>Gold: </span>
							{displayPlayer.money}
							{displayPlayer.tribe === playerTribe && (
								<span
									className='ml-2 text-xs'
									title='Gold received at the end of this turn'
								>
									+{totalVillageSalary(gameState, displayPlayer.tribe)}/turn
								</span>
							)}
						</span>
					</div>

					{/* Research-in-progress — surfaces on tablet+; mobile sees the
					    icon on the Tech button reflect researched count instead. */}
					{displayPlayer.researchInProgress && (
						// oxlint-disable-next-line react-doctor/no-cramped-container-padding -- Preserve the compact game HUD spacing contract.
						<div
							className='hidden items-center gap-1.5 rounded-md border border-teal-mist/25 bg-teal-deep/85 px-2 py-1 text-teal-mist md:flex'
							aria-live='polite'
						>
							<FlaskConical
								className='size-4 motion-safe:animate-pulse'
								aria-hidden='true'
							/>
							<span className='font-heading text-xs uppercase tracking-[0.12em]'>
								{capitalize(displayPlayer.researchInProgress.tech)}
							</span>
							<span className='font-mono text-gold-edge/70 text-xs tabular-nums'>
								{displayPlayer.researchInProgress.turnsRemaining}t
							</span>
						</div>
					)}
				</div>

				{/* Right cluster — state + tools + commit */}
				<div className='flex shrink-0 items-center gap-1 md:gap-2'>
					{gameState.isGameOver ? (
						<div className='flex h-9 items-center gap-1.5 rounded-md border border-victory-border/60 bg-victory-bg/70 px-2.5 text-victory-text'>
							<Trophy className='size-4 text-gold-bright' aria-hidden='true' />
							<span className='font-bold font-heading text-sm uppercase tracking-[0.1em]'>
								{gameState.winner
									? `${capitalize(gameState.winner)} wins`
									: 'Draw'}
							</span>
						</div>
					) : (
						// Turn counter is now visible on phones too — with End Turn
						// docked at the bottom on mobile, the top-bar finally has
						// room for an at-a-glance turn readout.
						<div
							className='flex h-9 items-center gap-1.5 rounded-md border border-teal-mist/35 bg-teal-deep/85 px-2 text-teal-mist md:px-2.5'
							aria-label={`Turn ${turn} of match.`}
						>
							<span className='font-heading text-[0.6rem] uppercase tracking-[0.18em] text-teal-mist/75'>
								Turn
							</span>{' '}
							<span className='font-bold font-heading tabular-nums text-gold-edge text-base leading-none'>
								{turn}
							</span>
						</div>
					)}

					<MenuButton
						onQuit={onQuit}
						onOpenHelp={onOpenHelp}
						onReplayTutorial={onReplayTutorial}
					/>

					{/* End Turn lives in the top-bar on desktop; on mobile it docks
					    bottom-right inside the ActionBar so the player's thumb can
					    reach it without crossing the board. */}
					<div className='hidden md:block'>
						<EndTurnButton
							turnTimer={turnTimer ?? null}
							confirmEndTurn={endTurnArmed}
							disabled={gameState.isGameOver}
							onClick={onEndTurn}
						>
							{gameState.isGameOver ? 'Game Over' : endTurnLabel}
						</EndTurnButton>
					</div>
				</div>
			</div>
		</header>
	)
}

interface EndTurnButtonProps {
	turnTimer: TurnTimerSnapshot | null
	confirmEndTurn: boolean
	disabled: boolean
	onClick: () => void
	children: React.ReactNode
}

function EndTurnButton({
	turnTimer,
	confirmEndTurn,
	disabled,
	onClick,
	children
}: EndTurnButtonProps) {
	return (
		<TurnTimerRing
			secondsRemaining={turnTimer?.secondsRemaining ?? null}
			totalSeconds={turnTimer?.totalSeconds ?? null}
			inset={5}
			strokeWidth={2.5}
			label='Your turn time remaining'
		>
			<Button
				data-onboarding-anchor='end-turn'
				data-press={confirmEndTurn ? 'ember' : 'gold'}
				onClick={onClick}
				className={cn(
					'relative h-11 rounded-md border-2 px-4 font-bold font-heading text-sm uppercase tracking-[0.08em] md:px-5 md:text-base',
					confirmEndTurn
						? 'border-gold-edge bg-linear-to-b from-ember-top to-ember-bottom text-gold-edge shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_3px_0_var(--ember-bevel),0_8px_16px_var(--ember-cast)] hover:from-ember-top-hover hover:to-ember-bottom-hover'
						: 'border-gold-edge bg-linear-to-b from-gold-top to-gold-bottom text-gold-text shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_var(--gold-bevel),0_8px_16px_var(--gold-cast)] hover:from-gold-top-hover hover:to-gold-bottom-hover'
				)}
				disabled={disabled}
			>
				{children}
			</Button>
		</TurnTimerRing>
	)
}
