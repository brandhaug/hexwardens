import {
	tribeToTribeStats,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import { getUnitDisplayName } from '@hexwardens/game-logic/domains/unit'

/** These are the same roster and treasury values used by match creation. */
export function TribeOpeningPreview({ tribe }: { tribe: Tribe | null }) {
	if (!tribe) {
		return null
	}
	const opening = tribeToTribeStats[tribe]
	const primary = getUnitDisplayName(opening.primaryUnit)
	let roster = primary
	if (opening.secondaryUnit === opening.primaryUnit) {
		roster = `2 ${primary}`
	} else if (opening.secondaryUnit) {
		roster = `${primary} and ${getUnitDisplayName(opening.secondaryUnit)}`
	}
	return (
		<section
			aria-label='Starting forces'
			className='space-y-1 border-y border-border py-3 text-sm'
			aria-live='polite'
		>
			<p>
				<span className='font-semibold capitalize'>{tribe}</span> starts with{' '}
				{roster} and <span className='tabular-nums'>{opening.money} gold</span>.
			</p>
			<p className='text-muted-foreground'>
				Starting research: none. Starting units are ready to act.
			</p>
			<p className='text-muted-foreground'>
				Level-5 village reward: {getUnitDisplayName(opening.heroUnit)}.
			</p>
		</section>
	)
}
