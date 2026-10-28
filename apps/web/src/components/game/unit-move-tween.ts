import { type BoardWorldPosition } from './board-position-to-world'

export const UNIT_MOVE_TWEEN_DURATION_MS = 260

export function unitMoveTween(
	from: BoardWorldPosition,
	to: BoardWorldPosition,
	t: number,
	reducedMotion = false
): BoardWorldPosition {
	if (reducedMotion || t >= 1) {
		return [to[0], to[1], to[2]]
	}
	if (t <= 0) {
		return [from[0], from[1], from[2]]
	}
	const progress = t * t * (3 - 2 * t)
	const distance = Math.hypot(to[0] - from[0], to[2] - from[2])
	const x = from[0] + (to[0] - from[0]) * progress
	const z = from[2] + (to[2] - from[2]) * progress
	const baseY = from[1] + (to[1] - from[1]) * progress
	const arc = Math.sin(progress * Math.PI) * Math.min(0.12, distance * 0.06)
	return [x, baseY + arc, z]
}
