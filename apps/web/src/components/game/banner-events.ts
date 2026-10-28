import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type GameState } from '@hexwardens/game-logic/game'
import { assertNever } from '@hexwardens/game-logic/type-utils'
import { capitalize } from '@/lib/utils'
import { isCapitalVillage } from './capital-village'

/**
 * A banner event is a match-level announcement derived from a transition
 * between two `GameState` snapshots — the screen-wide sibling of the
 * tile-anchored `Moment`. Banners carry the beats a player must not miss
 * while their eyes are on the board: the turn coming back to them, and a
 * capital changing hands. Victory and defeat stay with `GameOverOverlay`.
 *
 * Like moments, banner events are presentation-only and never feed back
 * into authoritative state. Each carries its own `id` so the renderer can
 * key mount/unmount idempotently.
 */
export type BannerEvent =
	| { readonly kind: 'your-turn'; readonly id: string; readonly turn: number }
	| {
			readonly kind: 'capital-captured'
			readonly id: string
			readonly byTribe: Tribe
			readonly fromTribe: Tribe
	  }

/**
 * Pure diff between two `GameState` snapshots — no DOM, no React. Consumes
 * only the public `GameState` shape so the same derivation works on the
 * offline state and on the server's `FilteredGameState` (the diff sees only
 * what the player can see, which is exactly what should be announced).
 */
export function computeBannerEvents(
	before: GameState,
	after: GameState,
	localTribe: Tribe,
	transitionId: string
): BannerEvent[] {
	const events: BannerEvent[] = []

	if (
		before.currentPlayerTribe !== localTribe &&
		after.currentPlayerTribe === localTribe &&
		!after.isGameOver
	) {
		events.push({
			kind: 'your-turn',
			id: `${transitionId}:your-turn`,
			turn: after.turn
		})
	}

	// A capital fell: a village that read as a capital in `before` is owned
	// by a different tribe in `after`. Classified on the *before* item — the
	// announcement is about what was taken, not what the captor keeps.
	const beforeBoard = before.units.board
	for (let r_idx = 0; r_idx < beforeBoard.length; r_idx++) {
		const row = beforeBoard[r_idx]
		if (!row) {
			continue
		}
		for (let q_idx = 0; q_idx < row.length; q_idx++) {
			const prevItem = row[q_idx]?.item
			if (prevItem?.type !== 'village') {
				continue
			}
			if (!isCapitalVillage(prevItem) || prevItem.tribe === null) {
				continue
			}
			const nextItem = after.units.board[r_idx]?.[q_idx]?.item
			if (nextItem?.type !== 'village') {
				continue
			}
			if (nextItem.tribe === null || nextItem.tribe === prevItem.tribe) {
				continue
			}
			events.push({
				kind: 'capital-captured',
				id: `${transitionId}:capital-captured:${q_idx},${r_idx}`,
				byTribe: nextItem.tribe,
				fromTribe: prevItem.tribe
			})
		}
	}

	return events
}

/**
 * Display copy + colour family for a banner. `tone` follows the moment
 * vocabulary: gold for the player's beats, ember only when the local
 * player genuinely lost something.
 */
export interface BannerCopy {
	readonly eyebrow: string
	readonly title: string
	readonly tone: 'gold' | 'ember'
}

export function bannerCopy(banner: BannerEvent, localTribe: Tribe): BannerCopy {
	switch (banner.kind) {
		case 'your-turn': {
			return {
				eyebrow: `Turn ${banner.turn}`,
				title: 'Your Move',
				tone: 'gold'
			}
		}
		case 'capital-captured': {
			if (banner.fromTribe === localTribe) {
				return {
					eyebrow: `To the ${capitalize(banner.byTribe)}`,
					title: 'Capital Lost',
					tone: 'ember'
				}
			}
			if (banner.byTribe === localTribe) {
				return {
					eyebrow: `From the ${capitalize(banner.fromTribe)}`,
					title: 'Capital Seized',
					tone: 'gold'
				}
			}
			return {
				eyebrow: `${capitalize(banner.byTribe)} over ${capitalize(banner.fromTribe)}`,
				title: 'Capital Taken',
				tone: 'gold'
			}
		}
		default: {
			return assertNever(banner)
		}
	}
}
