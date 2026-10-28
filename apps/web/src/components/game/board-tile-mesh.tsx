import { memo } from 'react'
import { type BoardRenderEntry } from './board-render-data'
import { FogCloudTile } from './tile-fog-cloud'
import { tileElevation } from './tile-elevation'
import { TerrainPrism } from './tile-terrain-prism'
import { TileItemMiniature } from './tile-item-miniature'
import { ObstacleMiniature } from './tile-obstacle-miniature'

interface BoardTileMeshProps {
	readonly entry: BoardRenderEntry
	readonly isHovered?: boolean
	readonly onEntryClick?: (entry: BoardRenderEntry) => void
	readonly onHover?: (hovered: boolean) => void
}

function BoardTileMeshView({
	entry,
	isHovered = false,
	onEntryClick,
	onHover
}: BoardTileMeshProps) {
	const [x, , z] = entry.worldPosition

	if (entry.kind === 'fog') {
		return (
			<FogCloudTile entry={entry} x={x} z={z} onEntryClick={onEntryClick} />
		)
	}

	const elevation = tileElevation(entry.tile)

	return (
		<group position={[x, 0, z]}>
			<TerrainPrism
				entry={entry}
				isHovered={isHovered}
				onEntryClick={onEntryClick}
				onHover={onHover}
			/>
			{entry.tile.obstacle && !entry.tile.item && (
				<ObstacleMiniature
					kind={entry.tile.obstacle}
					seedX={x}
					seedZ={z}
					topY={elevation.peakY + 0.05}
				/>
			)}
			{entry.tile.item && (
				<TileItemMiniature
					item={entry.tile.item}
					topY={elevation.surfaceY + 0.05}
				/>
			)}
		</group>
	)
}

export const BoardTileMesh = memo(BoardTileMeshView)
