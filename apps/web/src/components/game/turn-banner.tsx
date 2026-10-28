import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { useTurnBanner } from '@/hooks/use-turn-banner'
import { cn } from '@/lib/utils'
import { type BannerEvent, bannerCopy } from './banner-events'

interface TurnBannerProps {
	readonly gameState: GameState
	readonly localTribe: Tribe
}

/**
 * Match-level announcement plaque, floated over the top of the board:
 * "Turn 12 / Your Move" when the turn rotates back to the player, and
 * capital captures. One banner at a time, never interactive, and the
 * live region stays mounted so screen readers announce each change.
 */
export function TurnBanner({ gameState, localTribe }: TurnBannerProps) {
	const banner = useTurnBanner(gameState, localTribe)
	return (
		<div
			aria-live='polite'
			className='pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center px-4 md:top-10'
		>
			{banner && (
				<BannerPlaque key={banner.id} banner={banner} localTribe={localTribe} />
			)}
		</div>
	)
}

function BannerPlaque({
	banner,
	localTribe
}: {
	readonly banner: BannerEvent
	readonly localTribe: Tribe
}) {
	const copy = bannerCopy(banner, localTribe)
	const ember = copy.tone === 'ember'
	return (
		<div
			className={cn(
				'animate-moment-banner flex flex-col items-center gap-0.5 rounded-md border bg-teal-deep/90 px-7 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_3px_0_var(--teal-bevel),0_10px_24px_var(--hud-shadow-top)]',
				ember ? 'border-ember-base/60' : 'border-gold-edge/45'
			)}
		>
			<span className='font-heading font-semibold text-[0.65rem] text-teal-mist/85 uppercase tracking-[0.18em]'>
				{copy.eyebrow}
			</span>
			<span
				className={cn(
					'font-bold font-heading text-2xl uppercase tracking-[0.06em] md:text-3xl',
					ember ? 'text-ember-top' : 'text-gold-bright'
				)}
			>
				{copy.title}
			</span>
		</div>
	)
}
