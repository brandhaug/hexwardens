import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { positionKey } from '@hexwardens/game-logic/board/board'
import { getUnitDisplayName } from '@hexwardens/game-logic/domains/unit'
import { type BoardRenderEntry } from './board-render-data'

function describeTile(entry: BoardRenderEntry): string {
	const location = `Tile ${entry.position.q_idx}, ${entry.position.r_idx}`
	if (entry.kind === 'fog') {
		return `${location}: unexplored`
	}
	const { tile } = entry
	const parts = [location, tile.terrain]
	if (tile.isMountain) {
		parts.push('mountain')
	}
	if (tile.obstacle) {
		parts.push('obstacle')
	}
	if (tile.item?.type === 'village') {
		parts.push(
			`${tile.item.tribe ?? 'neutral'} ${tile.item.kind}, level ${tile.item.level}, capacity ${tile.item.population}/${tile.item.maxPopulation}`
		)
	} else if (tile.item) {
		parts.push('value' in tile.item ? tile.item.value : tile.item.type)
	}
	if (tile.unit) {
		parts.push(`${tile.unit.tribe} ${getUnitDisplayName(tile.unit.type)}`)
	}
	if (entry.isSelected) {
		parts.push('selected')
	}
	if (entry.isMoveable) {
		parts.push('reachable')
	}
	if (entry.isAttackable) {
		parts.push('attackable')
	}
	return parts.join(', ')
}

/** Native controls share the rendered board's filtered entries and click handler. */
export function AccessibleBoard({
	entries,
	onActivate,
	onClear
}: {
	readonly entries: readonly BoardRenderEntry[]
	readonly onActivate: (entry: BoardRenderEntry) => void
	readonly onClear: () => void
}) {
	const selectId = useId()
	const [cursor, setCursor] = useState<string | null>(null)
	const current =
		entries.find((entry) => positionKey(entry.position) === cursor) ??
		entries.find((entry) => entry.kind === 'tile' && entry.isSelected) ??
		entries[0]
	return (
		<details className='absolute top-2 left-2 z-20 max-w-[min(23rem,calc(100%-1rem))] rounded-md border border-border bg-card p-2 text-foreground shadow-md'>
			<summary className='min-h-11 cursor-pointer px-2 py-3 text-sm font-medium'>
				Keyboard board
			</summary>
			<div className='flex flex-col gap-2 p-1'>
				<p className='text-sm'>
					Choose a tile to inspect. Select your unit, then choose a reachable
					tile or attackable enemy. Escape clears selection.
				</p>
				<label htmlFor={selectId} className='text-sm font-medium'>
					Board tile
				</label>
				<select
					id={selectId}
					className='min-h-11 w-full rounded-md border border-input bg-background px-2 text-base'
					value={current ? positionKey(current.position) : ''}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.stopPropagation()
							onClear()
						}
					}}
					onChange={(event) => setCursor(event.target.value)}
				>
					{entries.map((entry) => (
						<option
							key={positionKey(entry.position)}
							value={positionKey(entry.position)}
						>
							{describeTile(entry)}
						</option>
					))}
				</select>
				<output aria-live='polite' className='text-sm'>
					{current ? describeTile(current) : 'No tiles available.'}
				</output>
				<Button
					disabled={!current || current.kind === 'fog'}
					onClick={() => {
						if (current) {
							onActivate(current)
						}
					}}
				>
					{activationLabel(current)}
				</Button>
			</div>
		</details>
	)
}

function activationLabel(entry: BoardRenderEntry | undefined): string {
	if (entry?.kind === 'tile' && entry.isAttackable) {
		return 'Attack here'
	}
	if (entry?.kind === 'tile' && entry.isMoveable) {
		return 'Move here'
	}
	return 'Select tile'
}
