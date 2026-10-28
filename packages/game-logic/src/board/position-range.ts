import { type BoardPosition } from './position'

/** Axial offsets cancel in distance; preserve the caller's tile traversal order. */
export function positionsWithin(
	positions: Iterable<BoardPosition>,
	center: BoardPosition,
	range: number
): BoardPosition[] {
	const nearby: BoardPosition[] = []
	for (const position of positions) {
		const dq = position.q_idx - center.q_idx
		const dr = position.r_idx - center.r_idx
		const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
		if (distance > 0 && distance <= range) {
			nearby.push(position)
		}
	}
	return nearby
}
