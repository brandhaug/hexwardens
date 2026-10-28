import {
	boardPositionToWorld,
	type BoardWorldPosition
} from './board-position-to-world'

function distance(a: BoardWorldPosition, b: BoardWorldPosition): number {
	const dx = a[0] - b[0]
	const dy = a[1] - b[1]
	const dz = a[2] - b[2]
	return Math.hypot(dx, dy, dz)
}

describe('boardPositionToWorld', () => {
	it('projects adjacent board positions into pointy-top world neighbors', () => {
		const boardRadius = 2
		const hexRadius = 1
		const spacing = 1

		const center = boardPositionToWorld({
			position: { q_idx: 2, r_idx: 2 },
			boardRadius,
			hexRadius,
			spacing
		})
		const east = boardPositionToWorld({
			position: { q_idx: 3, r_idx: 2 },
			boardRadius,
			hexRadius,
			spacing
		})
		const southEast = boardPositionToWorld({
			position: { q_idx: 2, r_idx: 3 },
			boardRadius,
			hexRadius,
			spacing
		})

		expect(center).toEqual([0, 0, 0])
		expect(east).toEqual([Math.sqrt(3), 0, 0])
		expect(southEast).toEqual([Math.sqrt(3) / 2, 0, 1.5])
		expect(distance(center, east)).toBeCloseTo(distance(center, southEast))
	})
})
