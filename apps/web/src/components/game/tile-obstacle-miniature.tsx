import { useMemo } from 'react'
import { type TileRenderEntry } from './board-render-data'
import { MeshAsset } from './mesh-asset'
import { resolveObstacleVisual } from './obstacle-visual-registry'
import { mulberry32, tileSeedFromWorld } from './tile-rng'

interface ObstacleMiniatureProps {
	readonly kind: NonNullable<TileRenderEntry['tile']['obstacle']>
	readonly seedX: number
	readonly seedZ: number
	readonly topY: number
}

export function ObstacleMiniature({
	kind,
	seedX,
	seedZ,
	topY
}: ObstacleMiniatureProps) {
	const { entry, groupScale, meshScale } = resolveObstacleVisual(kind)
	const { rotationY, offsetX, offsetZ } = useMemo(() => {
		const rand = mulberry32(tileSeedFromWorld(seedX, seedZ))
		return {
			rotationY: rand() * Math.PI * 2,
			offsetX: (rand() - 0.5) * 0.18,
			offsetZ: (rand() - 0.5) * 0.18
		}
	}, [seedX, seedZ])
	return (
		<group
			position={[offsetX, topY, offsetZ]}
			rotation={[0, rotationY, 0]}
			scale={[groupScale, groupScale, groupScale]}
			name={`obstacle: ${kind}`}
		>
			<MeshAsset path={entry.path} scale={meshScale} />
		</group>
	)
}
