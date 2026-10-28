import { memo } from 'react'
import { TerrainDefs } from '@/components/hex/terrain-defs'
import {
	type TileTerrain,
	terrains,
	terrainToFilterId
} from '@hexwardens/game-logic/tile/tile-terrain'
import { terrainToClassName } from '@/components/game/terrain-styles'

const HEX_SIZE = 28
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE
const HEX_HEIGHT = 2 * HEX_SIZE

const hexPointsString = [
	[HEX_WIDTH / 2, 0],
	[HEX_WIDTH, HEX_HEIGHT / 4],
	[HEX_WIDTH, (3 * HEX_HEIGHT) / 4],
	[HEX_WIDTH / 2, HEX_HEIGHT],
	[0, (3 * HEX_HEIGHT) / 4],
	[0, HEX_HEIGHT / 4]
]
	.map(([x, y]) => `${x},${y}`)
	.join(' ')

function TerrainTile({ terrain }: { terrain: TileTerrain }) {
	return (
		<div className='flex flex-col items-center gap-1.5'>
			<svg width={HEX_WIDTH} height={HEX_HEIGHT}>
				<polygon
					points={hexPointsString}
					className={terrainToClassName[terrain]}
					filter={`url(#${terrainToFilterId[terrain]})`}
				/>
			</svg>
			<span className='text-xs text-muted-foreground capitalize'>
				{terrain}
			</span>
		</div>
	)
}

function TerrainTileGridView() {
	return (
		<div className='not-prose my-6'>
			<TerrainDefs />
			<div className='grid grid-cols-4 gap-4 sm:grid-cols-6'>
				{terrains.map((terrain) => (
					<TerrainTile key={terrain} terrain={terrain} />
				))}
			</div>
		</div>
	)
}

export const TerrainTileGrid = memo(TerrainTileGridView)
