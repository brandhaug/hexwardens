import { type AchievementProgress } from '@/lib/achievement-progress'
import { formatDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

type AchievementsGalleryProps = {
	readonly progress: AchievementProgress
	/**
	 * Whether the viewer is looking at their own profile. Unlock dates only
	 * render when `true` — other players' dates stay private.
	 */
	readonly showUnlockDates: boolean
}

/**
 * Static, immutable presentation of every achievement. Locked entries are
 * dimmed but still show their description (no hidden achievements in v1).
 */
export function AchievementsGallery({
	progress,
	showUnlockDates
}: AchievementsGalleryProps) {
	return (
		<section
			className='space-y-5'
			aria-labelledby='achievements-heading'
			data-testid='achievements-gallery'
		>
			<header className='flex items-end justify-between gap-4 border-b border-border/70 pb-3'>
				<h2
					id='achievements-heading'
					className='font-heading text-xl font-semibold uppercase tracking-[0.18em] text-foreground md:text-2xl'
				>
					Achievements
				</h2>
				<p
					className='font-heading text-xs uppercase tracking-[0.3em] text-muted-foreground'
					data-testid='achievements-progress-count'
				>
					{progress.unlockedCount} / {progress.totalCount} unlocked
				</p>
			</header>

			<ul className='grid grid-cols-1 gap-3 md:grid-cols-2'>
				{progress.entries.map((entry) => (
					<li
						key={entry.achievement.id}
						data-testid={`achievement-${entry.achievement.id}`}
						data-unlocked={entry.unlocked ? 'true' : 'false'}
						className={cn(
							'flex flex-col gap-1.5 border bg-card/30 p-4',
							entry.unlocked
								? 'border-primary/40 text-foreground'
								: 'border-border/60 text-muted-foreground opacity-70'
						)}
					>
						<div className='flex items-baseline justify-between gap-3'>
							<h3
								className={cn(
									'font-heading text-sm uppercase tracking-[0.18em]',
									entry.unlocked ? 'text-foreground' : 'text-muted-foreground'
								)}
							>
								{entry.achievement.name}
							</h3>
							{entry.unlocked ? (
								<span className='font-heading text-[0.65rem] uppercase tracking-[0.22em] text-primary/80'>
									Unlocked
								</span>
							) : (
								<span className='font-heading text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground/70'>
									Locked
								</span>
							)}
						</div>
						<p className='font-sans text-xs italic'>
							{entry.achievement.description}
						</p>
						{entry.unlocked && showUnlockDates && entry.unlockedAt !== null ? (
							<time
								dateTime={entry.unlockedAt}
								className='font-sans text-[0.65rem] uppercase tracking-[0.18em] text-primary/70'
							>
								{formatDate(entry.unlockedAt)}
							</time>
						) : null}
					</li>
				))}
			</ul>
		</section>
	)
}
