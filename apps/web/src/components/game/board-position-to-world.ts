import { type BoardPosition } from '@hexwardens/game-logic/board/position'

export type BoardWorldPosition = readonly [x: number, y: number, z: number]

export interface BoardPositionToWorldInput {
	readonly position: BoardPosition
	readonly boardRadius: number
	readonly hexRadius: number
	readonly spacing: number
	readonly height?: number
}

export function boardPositionToWorld({
	position,
	boardRadius,
	hexRadius,
	spacing,
	height = 0
}: BoardPositionToWorldInput): BoardWorldPosition {
	const q = position.q_idx - boardRadius
	const r = position.r_idx - boardRadius
	const scaledRadius = hexRadius * spacing

	const x = scaledRadius * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
	const z = scaledRadius * ((3 / 2) * r)
	const worldPosition: BoardWorldPosition = [x, height, z]

	return worldPosition
}
