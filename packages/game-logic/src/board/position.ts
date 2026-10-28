export type BoardPosition = {
	readonly q_idx: number
	readonly r_idx: number
}

export type PositionKey = string

export type HexCoordinate = {
	q: number
	r: number
	s: number
}

export function positionKey(pos: BoardPosition): PositionKey {
	return `${pos.q_idx},${pos.r_idx}`
}
