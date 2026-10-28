/**
 * Hex tile geometry constants and arg builders. The board renders
 * pointy-top hexagons with six segments rotated by π/6, and every primitive
 * (terrain prism, overlay disc, ownership ring, highlight fill, highlight
 * border, village-range ring, fog cylinder) shares this orientation. Keep
 * the magic numbers in one module so a topology change (segment count,
 * rotation) is a one-line edit.
 */

const HEX_SEGMENTS = 6
const HEX_THETA_START = Math.PI / 6
const HEX_THETA_LENGTH = Math.PI * 2

export type CircleArgs = readonly [
	radius: number,
	segments: number,
	thetaStart: number,
	thetaLength: number
]

export type RingArgs = readonly [
	innerRadius: number,
	outerRadius: number,
	thetaSegments: number,
	phiSegments: number,
	thetaStart: number,
	thetaLength: number
]

export type CylinderArgs = readonly [
	radiusTop: number,
	radiusBottom: number,
	height: number,
	radialSegments: number
]

export function hexCircleArgs(radius: number): CircleArgs {
	return [radius, HEX_SEGMENTS, HEX_THETA_START, HEX_THETA_LENGTH]
}

export function hexRingArgs(
	innerRadius: number,
	outerRadius: number
): RingArgs {
	return [
		innerRadius,
		outerRadius,
		HEX_SEGMENTS,
		1,
		HEX_THETA_START,
		HEX_THETA_LENGTH
	]
}

export function hexPrismArgs(height: number, radius = 1): CylinderArgs {
	return [radius, radius, height, HEX_SEGMENTS]
}
