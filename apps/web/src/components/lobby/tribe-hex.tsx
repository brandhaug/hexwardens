import { TerrainDefs } from '@/components/hex/terrain-defs'
import { terrainToClassName } from '@/components/game/terrain-styles'
import {
	tribeToTerrain,
	type Tribe
} from '@hexwardens/game-logic/domains/tribe'
import { terrainToFilterId } from '@hexwardens/game-logic/tile/tile-terrain'

const SIZE = 18
const WIDTH = Math.sqrt(3) * SIZE
const HEIGHT = 2 * SIZE
const POINTS = [
	[WIDTH / 2, 0],
	[WIDTH, HEIGHT / 4],
	[WIDTH, (3 * HEIGHT) / 4],
	[WIDTH / 2, HEIGHT],
	[0, (3 * HEIGHT) / 4],
	[0, HEIGHT / 4]
]
	.map(([x, y]) => `${x},${y}`)
	.join(' ')

/**
 * Tiny home-terrain hex used inside tribe banners. The defs block is shared
 * across the app — embedding it once at the lobby root would also work, but
 * inlining it here keeps the banner self-contained for re-use elsewhere.
 */
export function TribeHex({ tribe }: { tribe: Tribe }) {
	const terrain = tribeToTerrain[tribe]
	return (
		<svg
			width={WIDTH}
			height={HEIGHT}
			role='presentation'
			aria-hidden='true'
			className='shrink-0'
		>
			<TerrainDefs />
			<polygon
				points={POINTS}
				className={terrainToClassName[terrain]}
				filter={`url(#${terrainToFilterId[terrain]})`}
			/>
		</svg>
	)
}
