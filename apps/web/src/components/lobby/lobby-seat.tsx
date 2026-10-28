import {
	tribeToColor,
	tribeToTextColor
} from '@hexwardens/game-logic/domains/tribe'
import { type Seat } from '@/lib/lobby/lobby-presentation'
import { cn } from '@/lib/utils'

type LobbySeatProps = {
	seat: Seat
}

/**
 * One seat at the table — a player banner if the seat is occupied, an empty
 * chair affordance otherwise.
 */
export function LobbySeat({ seat }: LobbySeatProps) {
	if (seat.kind === 'empty') {
		return (
			<div
				className='flex min-h-[60px] items-center justify-between gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2'
				aria-label={`Empty seat ${seat.seatIndex + 1}`}
			>
				<div className='flex items-center gap-2 text-sm text-muted-foreground'>
					<span className='font-heading text-base'>{seat.seatIndex + 1}</span>
					<span>Empty seat</span>
				</div>
			</div>
		)
	}

	const { slot, isSelf } = seat

	return (
		<div
			className={cn(
				'flex min-h-[60px] flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
				isSelf ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'
			)}
		>
			<span className='font-heading text-base text-muted-foreground'>
				{seat.seatIndex + 1}
			</span>
			<div className='flex min-w-0 flex-1 flex-col leading-tight'>
				<div className='flex items-center gap-2'>
					<span className='truncate text-sm font-medium'>{slot.username}</span>
					{slot.isHost && (
						<span className='shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-primary'>
							Host
						</span>
					)}
					{slot.isBot && (
						<span className='shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground'>
							Bot
						</span>
					)}
					{isSelf && !slot.isHost && (
						<span className='shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary-foreground'>
							You
						</span>
					)}
				</div>
				<div className='mt-0.5 flex items-center gap-2 text-xs text-muted-foreground'>
					{slot.tribe ? (
						<span
							className={cn(
								'rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider capitalize',
								tribeToColor[slot.tribe],
								tribeToTextColor[slot.tribe]
							)}
						>
							{slot.tribe}
						</span>
					) : (
						<span className='italic'>Choosing tribe…</span>
					)}
					{slot.isBot ? (
						<span className='capitalize'>{slot.botDifficulty}</span>
					) : (
						<span className={slot.isReady ? 'text-success' : ''}>
							{slot.isReady ? 'Ready' : 'Not ready'}
						</span>
					)}
				</div>
			</div>
		</div>
	)
}
