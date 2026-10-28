import { Html } from '@react-three/drei'
import { positionKey } from '@hexwardens/game-logic/board/board'
import { GAME_CONFIG } from '@hexwardens/game-logic/config'
import { type GameState } from '@hexwardens/game-logic/game'
import { type ActiveMoment } from '@/hooks/use-moment-feedback'
import {
	isTileAnchoredMoment,
	tileAnchoredMomentCallout,
	type TileAnchoredCallout
} from '@/lib/moment-feedback/moment'
import { cn } from '@/lib/utils'
import { boardPositionToWorld } from './board-position-to-world'
import { tileElevation } from './tile-elevation'

interface BoardMomentOverlayProps {
	readonly activeMoments: readonly ActiveMoment[]
	readonly board: GameState['units']['board']
	readonly boardRadius: number
	readonly hexRadius: number
}

const MOMENT_HEIGHT = 1.35
/** Lateral spread (world units) when several callouts land on one tile. */
const MOMENT_SPREAD = 0.62

/**
 * Bare floating numerals — Cinzel tabular figures so -3 and -13 hold the
 * same width while they rise. The dark text-shadow is what keeps an ember
 * red or moss green legible over bright grass and sand terrain.
 */
const NUMBER_TONE_CLASS: Record<TileAnchoredCallout['tone'], string> = {
	damage: 'text-destructive',
	heal: 'text-success',
	gold: 'text-gold-bright',
	renown: 'text-gold-edge'
}

/**
 * Plaque chips for the wordier moments (Defeated, Captured, Lv N) — same
 * carved teal-deep surface as the HUD chips so they read as game chrome,
 * with the tone carried by text and border colour only.
 */
const PLAQUE_TONE_CLASS: Record<TileAnchoredCallout['tone'], string> = {
	damage: 'border-ember-base/60 text-ember-top',
	heal: 'border-victory-border/60 text-victory-text',
	gold: 'border-gold-edge/45 text-gold-bright',
	renown: 'border-gold-edge/45 text-gold-edge'
}

export function BoardMomentOverlay({
	activeMoments,
	board,
	boardRadius,
	hexRadius
}: BoardMomentOverlayProps) {
	if (activeMoments.length === 0) {
		return null
	}

	// Same-tile collisions (e.g. a salary tick and a level-up on one village)
	// fan out horizontally instead of stacking into an unreadable pile.
	const perTileCount = new Map<string, number>()
	for (const { moment } of activeMoments) {
		if (!isTileAnchoredMoment(moment)) {
			continue
		}
		const key = positionKey(moment.at)
		perTileCount.set(key, (perTileCount.get(key) ?? 0) + 1)
	}
	const perTileIndex = new Map<string, number>()

	return (
		<>
			{activeMoments.map(({ moment }) => {
				if (!isTileAnchoredMoment(moment)) {
					return null
				}
				const key = positionKey(moment.at)
				const index = perTileIndex.get(key) ?? 0
				perTileIndex.set(key, index + 1)
				const count = perTileCount.get(key) ?? 1
				const spread = (index - (count - 1) / 2) * MOMENT_SPREAD

				const [x, , z] = boardPositionToWorld({
					position: moment.at,
					boardRadius,
					hexRadius,
					spacing: GAME_CONFIG.TILE_SPACING
				})
				// Anchor above the rendered terrain peak so mountain-top callouts
				// don't surface mid-slope. Fogged tiles fall back to flat ground.
				const tile = board[moment.at.r_idx]?.[moment.at.q_idx]
				const peakY = tile ? tileElevation(tile).peakY : 0
				const callout = tileAnchoredMomentCallout(moment)

				return (
					<Html
						key={moment.id}
						position={[x + spread, MOMENT_HEIGHT + peakY, z]}
						center
						distanceFactor={8}
						zIndexRange={[20, 0]}
					>
						{callout.emphasis === 'number' ? (
							<span
								className={cn(
									'animate-moment-callout pointer-events-none block whitespace-nowrap font-bold font-heading text-base tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/0.7),0_0_8px_rgb(0_0_0/0.35)]',
									NUMBER_TONE_CLASS[callout.tone]
								)}
							>
								{callout.label}
							</span>
						) : (
							<span
								className={cn(
									'animate-moment-callout pointer-events-none block whitespace-nowrap rounded-sm border bg-teal-deep/90 px-2 py-0.5 font-heading font-semibold text-[0.65rem] uppercase tracking-[0.14em] shadow-[0_2px_0_var(--chip-cast)]',
									PLAQUE_TONE_CLASS[callout.tone]
								)}
							>
								{callout.label}
							</span>
						)}
					</Html>
				)
			})}
		</>
	)
}
