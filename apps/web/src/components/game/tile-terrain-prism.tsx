import { useMemo } from 'react'
import { isWaterTerrain } from '@hexwardens/game-logic/tile/tile-terrain'
import {
	type BoardRenderEntry,
	type TileRenderEntry
} from './board-render-data'
import {
	terrainToMaterialColor,
	tribeToMaterialColor
} from './board-visual-registry'
import { terrainVisualRegistry } from './terrain-visual-registry'
import { tileElevation } from './tile-elevation'
import { hexCircleArgs, hexPrismArgs, hexRingArgs } from './tile-geometry'
import { TileHighlight } from './tile-highlight'
import { darkenHex } from './tile-rng'
import { WaterShimmer } from './tile-water-shimmer'

const TILE_SKIRT_RADIUS = 0.985
const SIDE_DARKEN_FACTOR = 0.62
const WATER_SIDE_DARKEN_FACTOR = 0.72

interface TerrainPrismProps {
	readonly entry: TileRenderEntry
	readonly isHovered: boolean
	readonly onEntryClick?: ((entry: BoardRenderEntry) => void) | undefined
	readonly onHover?: ((hovered: boolean) => void) | undefined
}

export function TerrainPrism({
	entry,
	isHovered,
	onEntryClick,
	onHover
}: TerrainPrismProps) {
	const isWater = isWaterTerrain(entry.tile.terrain)
	const { peakY: renderTopY, prismHeight: height } = tileElevation(entry.tile)
	const visual = terrainVisualRegistry[entry.tile.terrain]
	const ownerTribe =
		entry.tile.item && 'tribe' in entry.tile.item ? entry.tile.item.tribe : null
	const ownerColor = ownerTribe ? tribeToMaterialColor[ownerTribe] : null
	const sideColor = useMemo(() => {
		const base = terrainToMaterialColor[entry.tile.terrain]
		return darkenHex(
			base,
			isWater ? WATER_SIDE_DARKEN_FACTOR : SIDE_DARKEN_FACTOR
		)
	}, [entry.tile.terrain, isWater])
	const waterSeed = useMemo(() => {
		if (!isWater) {
			return 0
		}
		const [wx, , wz] = entry.worldPosition
		return wx * 1.3 + wz * 0.7
	}, [entry.worldPosition, isWater])
	return (
		<group>
			<mesh
				position={[0, renderTopY - height / 2 - 0.005, 0]}
				onClick={(event) => {
					event.stopPropagation()
					onEntryClick?.(entry)
				}}
				onPointerOver={(event) => {
					event.stopPropagation()
					onHover?.(true)
				}}
				onPointerOut={(event) => {
					event.stopPropagation()
					onHover?.(false)
				}}
				receiveShadow
				castShadow
			>
				<cylinderGeometry args={hexPrismArgs(height, TILE_SKIRT_RADIUS)} />
				<meshStandardMaterial
					color={sideColor}
					roughness={0.92}
					metalness={0}
				/>
			</mesh>
			{visual.overlayColor && (
				<mesh
					position={[0, renderTopY + 0.004, 0]}
					rotation={[-Math.PI / 2, 0, 0]}
				>
					<circleGeometry args={hexCircleArgs(0.97)} />
					<meshBasicMaterial
						color={visual.overlayColor}
						transparent
						opacity={visual.overlayOpacity ?? (isWater ? 0.3 : 0.18)}
						depthWrite={false}
					/>
				</mesh>
			)}
			{isWater && <WaterShimmer topY={renderTopY} seed={waterSeed} />}
			<mesh
				position={[0, renderTopY + 0.006, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
			>
				<ringGeometry args={hexRingArgs(0.965, 1)} />
				<meshBasicMaterial
					color={ownerColor ?? '#000000'}
					transparent
					opacity={ownerColor ? 0.9 : 0.22}
					depthWrite={false}
				/>
			</mesh>
			<TileHighlight
				entry={entry}
				topY={renderTopY + 0.012}
				isHovered={isHovered}
			/>
		</group>
	)
}
