import { useAtomValue } from '@effect/atom-react'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import { Trophy } from 'lucide-react'
import { todayDailyDate } from '@hexwardens/game-logic/daily-challenge/seed'
import { Label } from '@/components/ui/label'
import { dailyChallengeAtom } from '@/lib/atoms'

/**
 * Briefing card for today's Daily Challenge, rendered above the Public Queue
 * seating chart. Reads from the existing `dailyChallengeAtom` view endpoint
 * so the Player sees what they're shooting for before the Match starts.
 *
 * Renders nothing while loading or on failure — the briefing is a nice-to-have
 * and never blocks the lobby flow. See ADR-0008.
 */
export function DailyChallengeBriefing() {
	const today = todayDailyDate()
	const result = useAtomValue(dailyChallengeAtom(today))

	return AsyncResult.match(result, {
		onInitial: () => null,
		onFailure: () => null,
		onSuccess: ({ value: view }) => (
			<section className='space-y-2'>
				<Label>Today's Daily Challenge</Label>
				<div className='rounded-lg border border-border bg-muted/20 p-3'>
					<div className='flex items-start justify-between gap-3'>
						<div className='flex items-center gap-2'>
							<Trophy className='size-4 text-primary' aria-hidden='true' />
							<h3 className='font-heading text-sm font-semibold tracking-wide'>
								{view.challenge.name}
							</h3>
						</div>
						<span className='font-heading text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase'>
							Goal{' '}
							<span className='tabular-nums text-foreground/80'>
								{view.challenge.target}
							</span>
						</span>
					</div>
					<p className='mt-1.5 text-xs text-muted-foreground'>
						{view.challenge.description}
					</p>
					{view.callerBest ? (
						<div className='mt-2 flex items-center gap-2 text-[0.7rem]'>
							<span className='font-heading tracking-[0.18em] text-muted-foreground uppercase'>
								Your best today
							</span>
							<span className='font-heading font-semibold text-primary tabular-nums'>
								{view.callerBest.bestTurns} turns
							</span>
						</div>
					) : (
						<div className='mt-2 text-[0.7rem] text-muted-foreground/70'>
							No clear yet today — queue up to make an attempt.
						</div>
					)}
				</div>
			</section>
		)
	})
}
