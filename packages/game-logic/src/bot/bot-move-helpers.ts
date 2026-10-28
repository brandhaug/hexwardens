import { type Board, type BoardPosition } from '../board/board'

export function getMinDistance(
	from: BoardPosition,
	targets: readonly BoardPosition[],
	board: Board
): number {
	let minDist = Infinity
	for (const target of targets) {
		const dist = board.distance(from, target)
		if (dist < minDist) {
			minDist = dist
		}
	}
	return minDist
}

export function isWithinAnyVillageRange(
	pos: BoardPosition,
	villages: readonly BoardPosition[],
	board: Board
): boolean {
	for (const vPos of villages) {
		const village = board.at(vPos)?.item
		if (village?.type === 'village') {
			const dist = board.distance(pos, vPos)
			if (dist <= village.range) {
				return true
			}
		}
	}
	return false
}
