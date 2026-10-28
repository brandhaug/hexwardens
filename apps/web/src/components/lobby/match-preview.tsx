import { type LobbyConfig } from '@hexwardens/game-logic/multiplayer/types'
import { cn } from '@/lib/utils'

const MAP_SIZE_HEX_COUNT: Record<LobbyConfig['mapSize'], string> = {
	small: '61 hexes',
	medium: '91 hexes',
	large: '169 hexes'
}

const MAP_SIZE_DESCRIPTION: Record<LobbyConfig['mapSize'], string> = {
	small: 'Cosy skirmish — first contact in 2–3 turns.',
	medium: 'Balanced board — room to expand before clashing.',
	large: 'Wide map — long exploration arc, late-game pivots.'
}

/**
 * A pre-match config preview. Surfaces what the host has chosen so joining
 * players know the shape of the match before the board appears. Deliberately
 * descriptive — the seed is opaque before match creation, so we summarise the
 * board feel in prose instead of trying to render an actual board.
 */
export function MatchPreview({
	config,
	playerCount
}: {
	config: LobbyConfig
	playerCount: number
}) {
	const turnTimer = config.turnTimerSeconds
	const turnTimerLabel =
		turnTimer === null ? 'Unlimited' : `${turnTimer}s per turn`

	return (
		<div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
			<PreviewCell label='Map' value={config.mapSize} accent />
			<PreviewCell label='Tiles' value={MAP_SIZE_HEX_COUNT[config.mapSize]} />
			<PreviewCell
				label='Seats'
				value={`${playerCount} / ${config.maxPlayers}`}
			/>
			<PreviewCell label='Turn timer' value={turnTimerLabel} />
			<div className='col-span-2 sm:col-span-3'>
				<p className='text-xs italic text-muted-foreground'>
					{MAP_SIZE_DESCRIPTION[config.mapSize]}
				</p>
			</div>
		</div>
	)
}

function PreviewCell({
	label,
	value,
	accent = false
}: {
	label: string
	value: string
	accent?: boolean
}) {
	return (
		<div className='flex flex-col gap-0.5 rounded-lg border border-border bg-card/50 px-3 py-2'>
			<span className='text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground'>
				{label}
			</span>
			<span
				className={cn(
					'font-heading text-sm capitalize',
					accent && 'text-primary'
				)}
			>
				{value}
			</span>
		</div>
	)
}
