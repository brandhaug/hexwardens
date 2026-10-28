import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { inspectTileActions } from '@hexwardens/game-logic/actions/inspect'
import { type ActionIntent } from '@hexwardens/game-logic/actions/intent'
import { type BoardPosition } from '@hexwardens/game-logic/board/board'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'

export function ActionInspector({
	state,
	tribe,
	at,
	onAction
}: {
	readonly state: GameState
	readonly tribe: Tribe
	readonly at: BoardPosition | null
	readonly onAction: (intent: ActionIntent) => void
}) {
	const actions = useMemo(
		() => (at ? inspectTileActions(state, tribe, at) : []),
		[state, tribe, at]
	)
	if (actions.length === 0) {
		return null
	}
	return (
		<details className='pointer-events-auto max-h-[40dvh] overflow-y-auto rounded-md border border-border bg-card text-foreground'>
			<summary className='min-h-11 cursor-pointer p-3 text-sm font-medium'>
				Inspect actions
			</summary>
			<section
				aria-label='Action details'
				className='flex flex-col gap-4 px-3 pb-3'
			>
				{actions.map(({ label, plan, explanation }) => (
					<fieldset
						key={plan.intent.kind}
						aria-label={label}
						className='flex flex-col gap-1'
					>
						<Button
							variant='outline'
							disabled={plan.kind === 'denied'}
							onClick={() => {
								if (plan.kind === 'allowed') {
									onAction(plan.intent)
								}
							}}
						>
							{label}
						</Button>
						{plan.kind === 'allowed' && (
							<p className='text-sm'>{plan.cost.gold} gold</p>
						)}
						<p className='text-sm text-muted-foreground'>{explanation}</p>
					</fieldset>
				))}
			</section>
		</details>
	)
}
