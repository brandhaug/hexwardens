import { useFrame } from '@react-three/fiber'
import { useRef, useSyncExternalStore } from 'react'
import { type Group } from 'three'
import {
	RESOURCE_HARVEST_DURATION_MS,
	type ResourceHarvest
} from './resource-harvest-transitions'
import {
	prefersReducedMotion,
	subscribeReducedMotion
} from '@/lib/moment-feedback/reduced-motion'
import { type BoardWorldPosition } from './board-position-to-world'
import { TileItemMiniature } from './tile-item-miniature'

export interface ResourceHarvestAnimation extends ResourceHarvest {
	readonly key: string
	readonly startedAt: number
	readonly worldPosition: BoardWorldPosition
}

export function ResourceHarvestMiniature({
	animation
}: {
	readonly animation: ResourceHarvestAnimation
}) {
	const groupRef = useRef<Group>(null)
	const reducedMotion = useSyncExternalStore(
		subscribeReducedMotion,
		prefersReducedMotion,
		() => true
	)
	useFrame(() => {
		const group = groupRef.current
		if (!group) {
			return
		}
		const progress = Math.min(
			1,
			Math.max(
				0,
				(performance.now() - animation.startedAt) / RESOURCE_HARVEST_DURATION_MS
			)
		)
		const eased = 1 - (1 - progress) ** 3
		group.visible = !reducedMotion && progress < 1
		group.scale.setScalar(1 - eased)
		group.position.y = animation.worldPosition[1] + eased * 0.45
	})
	return (
		<group
			ref={groupRef}
			position={[...animation.worldPosition]}
			visible={!reducedMotion}
		>
			<TileItemMiniature item={animation.item} topY={0.05} />
		</group>
	)
}
