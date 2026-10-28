import {
	tribeToColor,
	tribeToTextColor,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import { cn } from '@/lib/utils'
import { getTribeMeta } from '@/lib/lobby/tribe-meta'
import { tribeToMaterialColor } from '@/components/game/board-visual-registry'
import { TribeIcon } from '@/components/game/tribe-icon'
import { TribeHex } from './tribe-hex'

type TribeBannerProps = {
	tribe: Tribe
	selected: boolean
	disabled: boolean
	suggested?: boolean
	/**
	 * Word shown when this banner is the active selection.
	 * - Multiplayer: defaults to "Claimed" (the player has reserved this
	 *   tribe so other seats can't pick it).
	 * - Single-player: pass `null` to hide the label — selection is already
	 *   communicated by the ring, and "Claimed" implies a contest that isn't
	 *   happening offline.
	 */
	selectedLabel?: string | null
	onSelect: () => void
}

/**
 * Tribe-pick banner — replaces the plain capsule toggle with a tabletop
 * "claim a banner" affordance. Uses the tribe's saturated identity colour as
 * a background stripe and pairs it with the home-terrain hex so the choice
 * feels like a faction reveal rather than a form input.
 */
export function TribeBanner({
	tribe,
	selected,
	disabled,
	suggested = false,
	selectedLabel = 'Claimed',
	onSelect
}: TribeBannerProps) {
	const meta = getTribeMeta(tribe)
	const materialColor = tribeToMaterialColor[tribe]
	const iconStyle: React.CSSProperties & Record<`--${string}`, string> = {
		backgroundColor: materialColor,
		'--tribe-icon-fg':
			tribeToTextColor[tribe] === 'text-black' ? '#1a1208' : '#fffdf0'
	}
	return (
		<button
			type='button'
			aria-pressed={selected}
			aria-label={`Choose ${tribe}`}
			disabled={disabled && !selected}
			onClick={onSelect}
			className={cn(
				'group relative flex min-h-[76px] flex-col items-center gap-2 overflow-hidden rounded-lg border p-2 text-left transition',
				'sm:flex-row sm:items-stretch sm:gap-3 sm:px-3',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				selected
					? 'border-primary ring-1 ring-primary/60'
					: 'border-border hover:border-primary/40',
				disabled && !selected
					? 'cursor-not-allowed opacity-40'
					: 'cursor-pointer'
			)}
		>
			{/* oxlint-disable-next-line react-doctor/no-pure-black-shadow -- Preserve the existing game chrome bevel and shadow tokens. */}
			<span
				className='relative grid size-14 shrink-0 place-items-center self-center rounded-md text-[color:var(--tribe-icon-fg)] shadow-[inset_0_-2px_0_rgba(0,0,0,0.18),0_1px_0_rgba(255,255,255,0.18)] transition-transform group-hover:scale-[1.04] sm:size-12'
				style={iconStyle}
				aria-hidden='true'
			>
				<TribeIcon tribe={tribe} className='size-8 sm:size-7' />
			</span>
			{/* Compact mobile layout: centered tribe label under the icon. */}
			<div className='flex w-full min-w-0 flex-col items-center gap-0.5 sm:hidden'>
				<span
					className={cn(
						'max-w-full truncate rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider',
						tribeToColor[tribe],
						tribeToTextColor[tribe]
					)}
				>
					{tribe}
				</span>
				{((selected && selectedLabel) || (suggested && !selected)) && (
					<span className='text-[0.55rem] font-semibold uppercase tracking-wider text-primary'>
						{selected ? selectedLabel : 'Last played'}
					</span>
				)}
			</div>
			{/* Full layout: tribe label + hero/terrain meta on the side. */}
			<div className='hidden min-w-0 flex-1 flex-col justify-center gap-1 sm:flex'>
				<div className='flex items-center justify-between gap-2'>
					<span
						className={cn(
							'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider',
							tribeToColor[tribe],
							tribeToTextColor[tribe]
						)}
					>
						{tribe}
					</span>
					{suggested && !selected && (
						<span className='shrink-0 text-[0.6rem] font-semibold uppercase tracking-wider text-primary'>
							Last played
						</span>
					)}
					{selected && selectedLabel && (
						<span className='shrink-0 text-[0.6rem] font-semibold uppercase tracking-wider text-primary'>
							{selectedLabel}
						</span>
					)}
				</div>
				<div className='flex items-center gap-2 text-xs text-muted-foreground'>
					<TribeHex tribe={tribe} />
					<div className='flex min-w-0 flex-col leading-tight'>
						<span className='truncate font-heading text-foreground'>
							{meta.heroLabel}
						</span>
						<span className='truncate capitalize'>{meta.terrain}</span>
					</div>
				</div>
			</div>
		</button>
	)
}
