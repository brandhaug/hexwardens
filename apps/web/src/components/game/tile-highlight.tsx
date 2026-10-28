import { useContext, useMemo, useRef } from 'react'
import { type Group } from 'three'
import { type TileRenderEntry } from './board-render-data'
import { HighlightOpacityContext } from './highlight-opacity-context'
import { useRegisterMoveablePulse } from './moveable-pulse-registry'
import { hexCircleArgs, hexRingArgs } from './tile-geometry'
import { getPerimeterEdgeGeometry } from './tile-perimeter-outline'
import {
	HIGHLIGHT_HOVER,
	HIGHLIGHT_MOVEABLE,
	PERIMETER_COLOR,
	tileHighlightColor
} from './tile-highlight-color'

function multiplyOpacity(opacity: number, multiplier: number): number {
	const result = opacity * multiplier
	if (result < 0) {
		return 0
	}
	if (result > 1) {
		return 1
	}
	return result
}

interface TileHighlightProps {
	readonly entry: TileRenderEntry
	readonly topY: number
	readonly isHovered: boolean
}

function MoveablePulse({
	color,
	opacityScale
}: {
	readonly color: string
	readonly opacityScale: number
}) {
	const pulseRef = useRef<Group>(null)
	useRegisterMoveablePulse(pulseRef)
	return (
		<group ref={pulseRef}>
			<mesh>
				<circleGeometry args={hexCircleArgs(0.94)} />
				<meshBasicMaterial
					color={color}
					transparent
					opacity={multiplyOpacity(0.24, opacityScale)}
					depthWrite={false}
				/>
			</mesh>
			<mesh position={[0, 0, 0.002]}>
				<ringGeometry args={hexRingArgs(0.84, 0.99)} />
				<meshBasicMaterial
					color={color}
					transparent
					opacity={multiplyOpacity(0.96, opacityScale)}
					depthWrite={false}
				/>
			</mesh>
		</group>
	)
}

export function TileHighlight({ entry, topY, isHovered }: TileHighlightProps) {
	const opacityScale = useContext(HighlightOpacityContext)
	const color = tileHighlightColor({
		isSelected: entry.isSelected,
		isAttackable: entry.isAttackable,
		isMoveable: entry.isMoveable,
		isHovered
	})
	const isHoverOnly = color === HIGHLIGHT_HOVER
	const isMoveable = color === HIGHLIGHT_MOVEABLE
	const perimeterSides = entry.perimeterSides
	const perimeterMask = useMemo(() => {
		if (!perimeterSides) {
			return 0
		}
		let mask = 0
		for (let i = 0; i < perimeterSides.length; i++) {
			if (perimeterSides[i]) {
				mask |= 1 << i
			}
		}
		return mask
	}, [perimeterSides])
	const perimeterGeometry =
		perimeterMask === 0 ? null : getPerimeterEdgeGeometry(perimeterMask)
	const showVillageRange = perimeterGeometry !== null
	if (!color && !showVillageRange) {
		return null
	}

	return (
		<group position={[0, topY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
			{color && isMoveable && (
				<MoveablePulse color={color} opacityScale={opacityScale} />
			)}
			{color && !isMoveable && !isHoverOnly && (
				<>
					<mesh>
						<circleGeometry args={hexCircleArgs(0.95)} />
						<meshBasicMaterial
							color={color}
							transparent
							opacity={multiplyOpacity(0.26, opacityScale)}
							depthWrite={false}
						/>
					</mesh>
					<mesh position={[0, 0, 0.002]}>
						<ringGeometry
							args={hexRingArgs(entry.isSelected ? 0.86 : 0.9, 0.98)}
						/>
						<meshBasicMaterial
							color={color}
							transparent
							opacity={multiplyOpacity(0.95, opacityScale)}
							depthWrite={false}
						/>
					</mesh>
				</>
			)}
			{color && entry.isSelected && (
				<mesh position={[0, 0, 0.004]}>
					<ringGeometry args={hexRingArgs(0.73, 0.77)} />
					<meshBasicMaterial
						color={color}
						transparent
						opacity={multiplyOpacity(0.95, opacityScale)}
						depthWrite={false}
					/>
				</mesh>
			)}
			{color && isHoverOnly && (
				<mesh position={[0, 0, 0.002]}>
					<ringGeometry args={hexRingArgs(0.93, 0.99)} />
					<meshBasicMaterial
						color={color}
						transparent
						opacity={multiplyOpacity(0.7, opacityScale)}
						depthWrite={false}
					/>
				</mesh>
			)}
			{perimeterGeometry && (
				<mesh geometry={perimeterGeometry} position={[0, 0, 0.003]}>
					<meshBasicMaterial
						color={PERIMETER_COLOR}
						transparent
						opacity={1}
						depthWrite={false}
					/>
				</mesh>
			)}
		</group>
	)
}
