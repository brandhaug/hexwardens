import { BufferAttribute, BufferGeometry } from 'three'

// `perimeterSides` order is [E, NE, NW, W, SW, SE]; side k's edge spans the
// pointy-top hex vertices at angles (k*60-30)° and (k*60+30)°. We emit a
// trapezoid quad per perimeter side so neighbouring territory tiles' shared
// edges drop out and the boundary reads as one outline rather than per-tile
// hex rings.
//
// At every corner where exactly one of the two adjacent sides is perimeter
// we also emit a filler triangle. Without it, the strips on this tile and
// the adjacent territory tile meet at the outer hex vertex but their inner
// edges (offset perpendicular to each tile's own edge) leave a wedge gap.
const HEX_NEIGHBOR_DISTANCE = Math.sqrt(3)
const PERIMETER_INNER_RADIUS = 0.86
const PERIMETER_OUTER_RADIUS = 1

// 64 possible mask values → bounded cache. Sharing geometry across tiles
// avoids per-mask BufferGeometry churn (each rebuild would leak GPU memory
// until WebGL context loss; Three.js geometries are not GC-disposed).
const perimeterGeometryCache = new Map<number, BufferGeometry>()

export function getPerimeterEdgeGeometry(
	perimeterMask: number
): BufferGeometry {
	const cached = perimeterGeometryCache.get(perimeterMask)
	if (cached) {
		return cached
	}
	const geometry = buildPerimeterEdgeGeometry(
		perimeterMask,
		PERIMETER_INNER_RADIUS,
		PERIMETER_OUTER_RADIUS
	)
	perimeterGeometryCache.set(perimeterMask, geometry)
	return geometry
}

function buildPerimeterEdgeGeometry(
	perimeterMask: number,
	innerRadius: number,
	outerRadius: number
): BufferGeometry {
	const positions: number[] = []
	const indices: number[] = []
	for (let k = 0; k < 6; k++) {
		if ((perimeterMask & (1 << k)) === 0) {
			continue
		}
		const angleA = ((k * 60 - 30) * Math.PI) / 180
		const angleB = ((k * 60 + 30) * Math.PI) / 180
		const baseIdx = positions.length / 3
		positions.push(
			innerRadius * Math.cos(angleA),
			innerRadius * Math.sin(angleA),
			0,
			outerRadius * Math.cos(angleA),
			outerRadius * Math.sin(angleA),
			0,
			outerRadius * Math.cos(angleB),
			outerRadius * Math.sin(angleB),
			0,
			innerRadius * Math.cos(angleB),
			innerRadius * Math.sin(angleB),
			0
		)
		indices.push(
			baseIdx,
			baseIdx + 1,
			baseIdx + 2,
			baseIdx,
			baseIdx + 2,
			baseIdx + 3
		)
	}
	for (let k = 0; k < 6; k++) {
		const sideKIsPerim = (perimeterMask & (1 << k)) !== 0
		const sideKp1IsPerim = (perimeterMask & (1 << ((k + 1) % 6))) !== 0
		if (sideKIsPerim === sideKp1IsPerim) {
			continue
		}
		const cornerAngle = ((k * 60 + 30) * Math.PI) / 180
		const internalSideIdx = sideKIsPerim ? (k + 1) % 6 : k
		const internalAngle = (internalSideIdx * 60 * Math.PI) / 180
		const outerX = outerRadius * Math.cos(cornerAngle)
		const outerY = outerRadius * Math.sin(cornerAngle)
		const innerX = innerRadius * Math.cos(cornerAngle)
		const innerY = innerRadius * Math.sin(cornerAngle)
		const neighbourCenterX = HEX_NEIGHBOR_DISTANCE * Math.cos(internalAngle)
		const neighbourCenterY = HEX_NEIGHBOR_DISTANCE * Math.sin(internalAngle)
		const adjInnerX =
			(1 - innerRadius) * neighbourCenterX + innerRadius * outerX
		const adjInnerY =
			(1 - innerRadius) * neighbourCenterY + innerRadius * outerY
		const baseIdx = positions.length / 3
		positions.push(
			outerX,
			outerY,
			0,
			innerX,
			innerY,
			0,
			adjInnerX,
			adjInnerY,
			0
		)
		indices.push(baseIdx, baseIdx + 1, baseIdx + 2)
	}
	const geometry = new BufferGeometry()
	geometry.setAttribute(
		'position',
		new BufferAttribute(new Float32Array(positions), 3)
	)
	geometry.setIndex(indices)
	return geometry
}
