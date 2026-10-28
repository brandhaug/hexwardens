import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../test/game-test-helpers'
import { Result } from 'effect'
import { snapshotFor } from './snapshot'
import { validateFilteredGameState } from './schema'

describe('fog-of-war schema (Hexwardens building roster)', () => {
	function viewerProjection() {
		// A village makes the surrounding tiles visible so the test has somewhere
		// to place items (fogged tiles can't host items in the wire schema).
		const board = createTestBoard(2)
		const center = board[2]?.[2]
		if (center) {
			requireTestValue(board[2])[2] = {
				...center,
				item: createTestVillage('barbarians')
			}
		}
		const state = createTestGameState({ board })
		const projected = snapshotFor(state, 'barbarians').projected
		assert(Result.isSuccess(projected))
		return {
			...projected.success,
			units: {
				...projected.success.units,
				board: projected.success.units.board.map((row) => [...row])
			}
		}
	}

	function findVisibleTile(filtered: ReturnType<typeof viewerProjection>) {
		for (let r_idx = 0; r_idx < filtered.units.board.length; r_idx++) {
			const row = requireTestValue(filtered.units.board[r_idx])
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				const tile = row[q_idx]
				if (tile && tile.terrain !== null) {
					return { r_idx, q_idx }
				}
			}
		}
		throw new Error('no visible tile in projection')
	}

	it('accepts a Large secondary building on a tile', () => {
		const filtered = viewerProjection()
		const { r_idx, q_idx } = findVisibleTile(filtered)
		const tile = requireTestValue(filtered.units.board[r_idx])[q_idx]
		assert(tile !== null && tile !== undefined && tile.terrain !== null)
		requireTestValue(filtered.units.board[r_idx])[q_idx] = {
			...tile,
			item: {
				type: 'secondaryBuilding',
				value: 'stables',
				state: 'large',
				tribe: 'barbarians'
			}
		}
		const result = validateFilteredGameState(filtered, 'barbarians')
		expect(Result.isSuccess(result)).toBe(true)
	})

	it('accepts a utility building on a tile', () => {
		const filtered = viewerProjection()
		const { r_idx, q_idx } = findVisibleTile(filtered)
		const tile = requireTestValue(filtered.units.board[r_idx])[q_idx]
		assert(tile !== null && tile !== undefined && tile.terrain !== null)
		requireTestValue(filtered.units.board[r_idx])[q_idx] = {
			...tile,
			item: {
				type: 'utilityBuilding',
				value: 'market',
				state: 'built',
				tribe: 'barbarians'
			}
		}
		const result = validateFilteredGameState(filtered, 'barbarians')
		expect(Result.isSuccess(result)).toBe(true)
	})
})
