import { ActionInspector } from './action-inspector'
import { haptic } from '@/lib/haptics'
import { actionDockMessage } from './action-dock-message'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { useMemo } from 'react'
import {
	BookOpen,
	SkipForward,
	Coins,
	Compass,
	Flag,
	Hammer,
	Hand,
	Heart,
	Hourglass,
	Sparkles,
	Swords,
	TrendingUp,
	Undo2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TurnTimerRing } from '@/components/game/turn-timer-ring'
import { type TurnTimerSnapshot } from '@/lib/use-turn-timer'
import { cn } from '@/lib/utils'
import {
	type AllowedActionPlan,
	type ActionIntent
} from '@hexwardens/game-logic/actions/intent'
import { type BoardPosition } from '@hexwardens/game-logic/board/board.ts'
import { availableActions } from '@hexwardens/game-logic/dispatch'
import { type GameState } from '@hexwardens/game-logic/game'
import { type TileState } from '@hexwardens/game-logic/tile/tile'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'

interface ActionBarProps {
	selectedTile: BoardPosition | null
	selectedTileData: TileState | null
	currentGameState: GameState
	currentPlayerTribe: Tribe
	onAction: (action: AllowedActionPlan['intent']) => void
	onOpenResearch: () => void
	onOpenTrain: () => void
	/** Wired through so the bottom-right End Turn FAB can commit a turn on
	    mobile. On desktop the dock skips rendering it and the top-bar owns the
	    button instead. */
	endTurnArmed: boolean
	onEndTurn: () => void
	turnTimer?: TurnTimerSnapshot | null
	isGameOver: boolean
	readyUnitCount: number
	onNextUnit: () => void
	canAct: boolean
}

const intentToIcon = (
	kind: ActionIntent['kind']
): React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }> => {
	switch (kind) {
		case 'build': {
			return Hammer
		}
		case 'capture': {
			return Flag
		}
		case 'collect': {
			return Sparkles
		}
		case 'explore': {
			return Compass
		}
		case 'heal': {
			return Heart
		}
		case 'recover': {
			return Undo2
		}
		case 'upgrade-to-large': {
			return TrendingUp
		}
		case 'train': {
			return Swords
		}
		case 'research': {
			return BookOpen
		}
		case 'selectPerk': {
			return Sparkles
		}
		case 'retire': {
			return Hammer
		}
		default: {
			return assertNever(kind)
		}
	}
}

export function ActionBar({
	selectedTile,
	selectedTileData,
	currentGameState,
	currentPlayerTribe,
	onAction,
	onOpenResearch,
	onOpenTrain,
	endTurnArmed,
	onEndTurn,
	turnTimer,
	isGameOver,
	readyUnitCount,
	onNextUnit,
	canAct
}: ActionBarProps) {
	const availableTileActions = useMemo(() => {
		if (!selectedTile || !selectedTileData) {
			return []
		}
		return availableActions(currentGameState, currentPlayerTribe, selectedTile)
	}, [selectedTile, selectedTileData, currentGameState, currentPlayerTribe])

	const { regularActions, hasTrainActions, hasResearchActions } = groupActions(
		availableTileActions,
		selectedTileData,
		currentPlayerTribe
	)

	const hasActions =
		selectedTile &&
		selectedTileData &&
		(regularActions.length > 0 || hasTrainActions || hasResearchActions)

	const endTurnLabel = endTurnArmed ? 'Confirm?' : 'End Turn'

	return (
		<div
			id='action-dock'
			data-onboarding-anchor='action-bar'
			data-game-chrome
			tabIndex={-1}
			className='hud-edge-bottom relative shrink-0 border-teal-edge border-t bg-teal-card focus-visible:outline-none'
			style={{
				// Buttons run flush to the top of the dock so it reads as a tray
				// of chunky controls instead of a panel with art-direction
				// gutters. A tiny bottom inset keeps each button's beveled drop
				// shadow visible, and the home-indicator safe-area stacks below
				// that on iOS.
				paddingTop: '0',
				paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom))',
				paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
				paddingRight: 'max(0.5rem, env(safe-area-inset-right))'
			}}
		>
			<NextUnitControl
				canAct={canAct}
				readyUnitCount={readyUnitCount}
				onNextUnit={onNextUnit}
			/>
			<ActionInspector
				state={currentGameState}
				tribe={currentPlayerTribe}
				at={selectedTile}
				onAction={onAction}
			/>
			<SelectedUnitStatus
				state={currentGameState}
				tribe={currentPlayerTribe}
				at={selectedTile}
				hasActions={!!hasActions}
			/>
			{/* Fixed-height row keeps the Board canvas aspect-stable; the perspective
			    camera reprojects on every aspect change. The mobile layout pins
			    End Turn flush-right (thumb zone) and lets the actions scroll
			    horizontally to its left. Desktop drops the FAB and lets the
			    action cluster center inside the bar. */}
			<div className='mx-auto flex h-[72px] max-w-4xl items-stretch gap-2 md:h-16 md:gap-0'>
				<div className='flex min-w-0 flex-1 items-stretch'>
					{hasActions ? (
						<div className='no-scrollbar snap-x-dock -mx-2 flex w-full items-stretch gap-2 overflow-x-auto px-2 md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0'>
							{regularActions.map((action) => {
								const cost = action.cost.gold || null
								const isDestructive = action.preview.variant === 'destructive'
								const Icon = intentToIcon(action.intent.kind)

								return (
									<ActionDockButton
										key={action.preview.actionType}
										variant={isDestructive ? 'ember' : 'gold'}
										onClick={() => onAction(action.intent)}
										label={action.preview.label}
										cost={cost ?? undefined}
										icon={<Icon className='size-5' aria-hidden='true' />}
									/>
								)
							})}

							{hasResearchActions && (
								<ActionDockButton
									variant='teal'
									onClick={onOpenResearch}
									label='Research'
									icon={<BookOpen className='size-5' aria-hidden='true' />}
								/>
							)}

							{hasTrainActions && (
								<ActionDockButton
									variant='gold'
									onClick={onOpenTrain}
									label='Train'
									icon={<Swords className='size-5' aria-hidden='true' />}
								/>
							)}
						</div>
					) : (
						<EmptyActionDock
							message={actionDockMessage(
								currentGameState,
								currentPlayerTribe,
								selectedTile
							)}
						/>
					)}
				</div>

				{/* Mobile-only End Turn FAB; desktop renders the same control from
				    inside the top-bar so this docked variant only ships on touch. */}
				<DockedEndTurnButton
					turnTimer={turnTimer ?? null}
					armed={endTurnArmed}
					disabled={isGameOver || !canAct}
					onClick={onEndTurn}
					label={isGameOver ? 'Game Over' : endTurnLabel}
				/>
			</div>
		</div>
	)
}

function SelectedUnitStatus({
	state,
	tribe,
	at,
	hasActions
}: {
	state: GameState
	tribe: Tribe
	at: BoardPosition | null
	hasActions: boolean
}) {
	if (
		!hasActions ||
		!at ||
		state.units.board[at.r_idx]?.[at.q_idx]?.unit?.tribe !== tribe
	) {
		return null
	}
	return (
		<output className='block px-2 py-1 text-sm text-teal-mist'>
			{actionDockMessage(state, tribe, at)}
		</output>
	)
}

interface ActionDockButtonProps {
	variant: 'gold' | 'ember' | 'teal'
	onClick: () => void
	label: string
	cost?: number | undefined
	icon: React.ReactNode
}

const dockButtonStyles: Record<ActionDockButtonProps['variant'], string> = {
	gold: 'border-gold-edge bg-linear-to-b from-gold-top to-gold-bottom text-gold-text shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_0_var(--gold-bevel),0_9px_16px_var(--gold-cast)] hover:from-gold-top-hover hover:to-gold-bottom-hover',
	ember:
		'border-gold-edge bg-linear-to-b from-ember-top to-ember-bottom text-gold-edge shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_4px_0_var(--ember-bevel),0_9px_16px_var(--ember-cast)] hover:from-ember-top-hover hover:to-ember-bottom-hover',
	teal: 'border-teal-mist bg-linear-to-b from-teal-top to-teal-bottom text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_0_var(--teal-bevel),0_9px_16px_var(--teal-cast)] hover:from-teal-top-hover hover:to-teal-bottom-hover'
}

function ActionDockButton({
	variant,
	onClick,
	label,
	cost,
	icon
}: ActionDockButtonProps) {
	return (
		<Button
			size='sm'
			data-press={variant}
			onClick={() => {
				haptic('tap')
				onClick()
			}}
			className={cn(
				// On mobile each action grows to fill its share of the dock so
				// 1-2 actions don't leave a void next to the End Turn FAB —
				// every dock button feels chunky and pressable. `max-w-[160px]`
				// keeps a lone action from stretching into a runway. Desktop
				// drops the grow (`md:flex-none`) so the centered wrap layout
				// keeps its fixed 112px slots.
				// `coarse:h-full` overrides the Button cva's coarse-touch
				// height variant; without it the dock button collapses to 40px
				// on touch and floats inside the 72px tray.
				'flex h-full min-w-[88px] max-w-[160px] flex-1 flex-shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-md border-2 px-3 font-bold coarse:h-full md:min-w-[112px] md:max-w-none md:flex-none',
				dockButtonStyles[variant]
			)}
		>
			{icon}
			<span className='font-heading text-[0.6875rem] uppercase leading-none tracking-[0.06em] md:text-xs'>
				{label}
			</span>
			{cost !== undefined && (
				<span className='flex items-center gap-0.5 text-[0.625rem] leading-none tabular-nums opacity-90'>
					<Coins className='size-3' aria-hidden='true' />
					{cost}
				</span>
			)}
		</Button>
	)
}

function EmptyActionDock({ message }: { message: string }) {
	return (
		<div className='flex h-full w-full items-center justify-center gap-2 text-teal-mist/85'>
			<Hand className='size-4 opacity-70' aria-hidden='true' />
			<span className='text-sm leading-snug'>{message}</span>
		</div>
	)
}

interface DockedEndTurnButtonProps {
	turnTimer: TurnTimerSnapshot | null
	armed: boolean
	disabled: boolean
	label: string
	onClick: () => void
}

/**
 * Mobile-only End Turn FAB pinned to the right edge of the action dock.
 * Lifted out of the top bar because the upper-right corner sits outside the
 * one-handed thumb arc on phones — this is the single most-tapped control in
 * the game and it must live in the bottom-right where the player's grip rests.
 */
function DockedEndTurnButton({
	turnTimer,
	armed,
	disabled,
	label,
	onClick
}: DockedEndTurnButtonProps) {
	return (
		<div className='flex shrink-0 items-stretch md:hidden'>
			<TurnTimerRing
				secondsRemaining={turnTimer?.secondsRemaining ?? null}
				totalSeconds={turnTimer?.totalSeconds ?? null}
				inset={5}
				strokeWidth={2.5}
				label='Your turn time remaining'
			>
				<Button
					data-onboarding-anchor='end-turn-mobile'
					data-press={armed ? 'ember' : 'gold'}
					onClick={onClick}
					disabled={disabled}
					className={cn(
						// `coarse:h-full` overrides the Button cva default coarse
						// height so the FAB fills the 72px dock tray on touch
						// instead of collapsing to 44px.
						'flex h-full min-w-[96px] snap-start flex-col items-center justify-center gap-0.5 rounded-md border-2 px-3 font-bold coarse:h-full',
						armed
							? 'border-gold-edge bg-linear-to-b from-ember-top to-ember-bottom text-gold-edge shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_4px_0_var(--ember-bevel),0_9px_16px_var(--ember-cast)] hover:from-ember-top-hover hover:to-ember-bottom-hover'
							: 'border-gold-edge bg-linear-to-b from-gold-top to-gold-bottom text-gold-text shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_0_var(--gold-bevel),0_9px_16px_var(--gold-cast)] hover:from-gold-top-hover hover:to-gold-bottom-hover'
					)}
				>
					<Hourglass className='size-5' aria-hidden='true' />
					<span className='font-heading text-[0.6875rem] uppercase leading-none tracking-[0.08em]'>
						{label}
					</span>
				</Button>
			</TurnTimerRing>
		</div>
	)
}

function groupActions(
	availableTileActions: AllowedActionPlan[],
	selectedTileData: TileState | null,
	currentPlayerTribe: Tribe
) {
	const regularActions: AllowedActionPlan[] = []
	let hasTrainActions =
		selectedTileData?.item?.type === 'village' &&
		selectedTileData.item.tribe === currentPlayerTribe
	let hasResearchActions = hasTrainActions
	for (const a of availableTileActions) {
		const kind = a.intent.kind
		if (kind === 'train') {
			hasTrainActions = true
		} else if (kind === 'research') {
			hasResearchActions = true
		} else if (kind === 'selectPerk') {
			// Perk picks are surfaced through the dedicated PerkChoicePanel —
			// keep them off the action bar to avoid double-rendering.
			continue
		} else {
			regularActions.push(a)
		}
	}

	return { regularActions, hasTrainActions, hasResearchActions }
}

function NextUnitControl({
	canAct,
	readyUnitCount,
	onNextUnit
}: Pick<ActionBarProps, 'canAct' | 'readyUnitCount' | 'onNextUnit'>) {
	return (
		<div className='flex items-center justify-between gap-2 px-2 py-1'>
			<Button
				variant='ghost'
				className='min-h-11 gap-2'
				disabled={!canAct || readyUnitCount === 0}
				onClick={onNextUnit}
				aria-label={`Next unit, ${readyUnitCount} needing orders`}
			>
				<SkipForward className='size-4' aria-hidden='true' />
				Next unit <span className='tabular-nums'>{readyUnitCount}</span>
			</Button>
			<span className='text-sm text-teal-mist' aria-live='polite'>
				{readyUnitCount} needing orders
			</span>
		</div>
	)
}
