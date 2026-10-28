import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { haptic } from '@/lib/haptics'
import { type ActionIntent } from '@hexwardens/game-logic/actions/intent'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import {
	villagePerkToDescription,
	type VillagePerk
} from '@hexwardens/game-logic/domains/village'
import { getVillageName } from '@hexwardens/game-logic/domains/village-naming'
import { type GameState } from '@hexwardens/game-logic/game'
import { type BoardPosition } from '@hexwardens/game-logic/board/position'

interface PerkChoicePanelProps {
	gameState: GameState
	playerTribe: Tribe
	onAction: (action: ActionIntent) => void
	/**
	 * Asks the host to focus the Village whose level-up earned the head-of-queue
	 * Perk choice — the panel calls this on mount so the choice anchors visually.
	 */
	onFocusVillage: (position: BoardPosition | null) => void
}

/**
 * Inline level-up Perk picker.
 *
 * Shown whenever the local Player has at least one pending Perk choice.
 * Per ADR-0001 the choice is gameplay-blocking — the panel sits alongside the
 * board and stays visible until every queued Perk has been chosen. We render
 * the head-of-queue prompt only; the player resolves prompts in earned order.
 */
export function PerkChoicePanel({
	gameState,
	playerTribe,
	onAction,
	onFocusVillage
}: PerkChoicePanelProps) {
	const queue = gameState.pendingPerkChoices[playerTribe] ?? []
	const head = queue[0]
	if (!head || gameState.currentPlayerTribe !== playerTribe) {
		return null
	}
	const villageName =
		getVillageName(gameState, head.villagePosition) ?? 'Village'

	return (
		<Card
			className='motion-safe:animate-[panel-rise_220ms_cubic-bezier(0.16,1,0.3,1)] fixed inset-x-3 bottom-[max(6rem,calc(env(safe-area-inset-bottom)+6rem))] z-30 mx-auto max-w-xl ring-1 ring-foreground/10 shadow-2xl md:right-6 md:bottom-28 md:left-auto md:mx-0'
			data-testid='perk-choice-panel'
			data-game-chrome
		>
			<CardHeader className='pb-2'>
				<CardTitle className='flex items-center justify-between gap-3 text-base'>
					<span className='min-w-0 truncate font-heading text-sm uppercase tracking-[0.06em]'>
						{villageName} · Lv {head.level}
					</span>
					<button
						type='button'
						className='shrink-0 rounded-md border border-foreground/15 px-2 py-1 font-heading text-[0.65rem] text-foreground/70 uppercase tracking-[0.12em] hover:bg-muted'
						onClick={() => {
							haptic('tap')
							onFocusVillage(head.villagePosition)
						}}
					>
						Show village
					</button>
				</CardTitle>
			</CardHeader>
			<CardContent className='flex flex-col gap-2'>
				{head.options.map((perk) => (
					<PerkOptionButton
						key={perk}
						perk={perk}
						onSelect={() => {
							haptic('commit')
							onAction({
								kind: 'selectPerk',
								at: head.villagePosition,
								perk
							})
						}}
					/>
				))}
				{queue.length > 1 && (
					<p className='font-heading text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]'>
						{queue.length - 1} more level-up
						{queue.length - 1 === 1 ? '' : 's'} to resolve
					</p>
				)}
			</CardContent>
		</Card>
	)
}

function PerkOptionButton({
	perk,
	onSelect
}: {
	perk: VillagePerk
	onSelect: () => void
}) {
	const meta = villagePerkToDescription[perk]
	const isHeroPerk = perk === 'special_unit'
	return (
		<Button
			variant={isHeroPerk ? 'default' : 'secondary'}
			data-press={isHeroPerk ? 'gold' : 'teal'}
			className='h-auto min-h-14 justify-start whitespace-normal py-2.5 text-left'
			onClick={onSelect}
		>
			<div className='flex flex-col gap-0.5 py-1'>
				<span className='flex items-center gap-2 font-semibold text-sm'>
					{meta.name}
					{isHeroPerk && (
						<span className='rounded bg-primary/25 px-1.5 py-0.5 font-heading text-[0.6rem] text-primary uppercase tracking-[0.16em]'>
							Hero
						</span>
					)}
				</span>
				<span className='text-muted-foreground text-xs leading-snug'>
					{meta.description}
				</span>
			</div>
		</Button>
	)
}
