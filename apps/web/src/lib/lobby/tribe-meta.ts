import {
	tribeToTerrain,
	tribeToTribeStats,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'

export type TribeMeta = {
	tribe: Tribe
	/** Hero unit name in title case, e.g. "Skeleton Golem". */
	heroLabel: string
	terrain: TileTerrain
}

function humanise(slug: string): string {
	return slug
		.split('_')
		.map((part) =>
			part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : ''
		)
		.join(' ')
}

/**
 * Pulls the bits of `@hexwardens/game-logic/domains/tribe` the lobby banner
 * shows — the hero unit name and the home terrain — and stitches them into
 * the shape the React component expects. Centralising the lookup keeps the
 * banner pure: it never reaches into game-logic itself.
 */
export function getTribeMeta(tribe: Tribe): TribeMeta {
	return {
		tribe,
		heroLabel: humanise(tribeToTribeStats[tribe].heroUnit),
		terrain: tribeToTerrain[tribe]
	}
}
