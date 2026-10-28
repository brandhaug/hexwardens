import { Trophy } from 'lucide-react'
import { useMemo } from 'react'
import {
	DAILY_CHALLENGE_REGISTRY,
	type DailyChallengeProgress
} from '@hexwardens/game-logic/daily-challenge/registry'
import { dailyChallengeForDate } from '@hexwardens/game-logic/daily-challenge/rotation'
import { todayDailyDate } from '@hexwardens/game-logic/daily-challenge/seed'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type ChronicleEntry } from '@hexwardens/game-logic/match/chronicle/chronicle-entry'
import { cn } from '@/lib/utils'

interface DailyChallengeHudProps {
	readonly entries: readonly ChronicleEntry[]
	readonly viewer: Tribe
}

/**
 * Private in-match progress chip for today's Daily Challenge. The chip mirrors
 * the same pure `evaluate(...)` the game-server runs at Match-end — server is
 * authoritative on completion, the chip is cosmetic during play.
 *
 * Hidden entirely until the Player has made progress, then docks at the top
 * of the viewport. Private to the active Player; opponents never see this.
 * See ADR-0008.
 */
export function DailyChallengeHud({ entries, viewer }: DailyChallengeHudProps) {
	const challenge = useMemo(() => {
		const id = dailyChallengeForDate(todayDailyDate())
		return DAILY_CHALLENGE_REGISTRY[id]
	}, [])

	const progress: DailyChallengeProgress = useMemo(
		() => challenge.evaluate(entries, viewer),
		[challenge, entries, viewer]
	)

	if (progress.progress === 0 && !progress.completed) {
		return null
	}

	return (
		<div className='pointer-events-none fixed top-14 left-3 z-30 sm:left-4'>
			<div
				className={cn(
					'pointer-events-auto flex items-center gap-3 rounded-lg border bg-card/95 px-3 py-2 shadow-lg',
					progress.completed ? 'border-primary/70' : 'border-border/60'
				)}
				// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This live region contains block content; output only accepts phrasing content.
				role='status'
				aria-live='polite'
				aria-label={
					progress.completed
						? `Daily Challenge cleared on turn ${progress.completedAtTurn}`
						: `Daily Challenge: ${progress.progress} of ${progress.target}`
				}
			>
				<div
					className={cn(
						'flex size-8 shrink-0 items-center justify-center rounded-md border',
						progress.completed
							? 'border-primary/40 bg-primary/15 text-primary'
							: 'border-border bg-muted/40 text-muted-foreground'
					)}
					aria-hidden='true'
				>
					<Trophy className='size-4' />
				</div>
				<div className='min-w-0 leading-tight'>
					<div className='font-heading text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase'>
						Daily · {challenge.name}
					</div>
					{progress.completed && progress.completedAtTurn !== null ? (
						<div className='font-heading text-sm font-semibold text-primary'>
							Cleared · Turn {progress.completedAtTurn}
						</div>
					) : (
						<div className='font-heading text-sm tabular-nums'>
							<span className='text-foreground'>{progress.progress}</span>
							<span className='text-muted-foreground/70'>
								/{progress.target}
							</span>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
