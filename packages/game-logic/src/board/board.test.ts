import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	withUnits
} from '../test/game-test-helpers'
import { Result } from 'effect'
import { executeMovement } from '../units/world-movement'
import { assert } from 'vite-plus/test'
import { editPlayer } from '../player/player-state'
import { Board, calculateBoardDimensions, canMoveTo, loadBoard } from './board'

describe('Board construction', () => {
	it('computes radius from tile-grid size', () => {
		const board = Board.from(createTestBoard(3))
		expect(board.radius).toBe(3)
		expect(board.size).toBe(7)
	})

	it('loadBoard returns a Board instance', () => {
		const board = loadBoard(createTestBoard(2))
		expect(board).toBeInstanceOf(Board)
	})
})

describe('Board.at / contains / key', () => {
	const board = Board.from(createTestBoard(2))

	it('reads a tile at an in-range position', () => {
		const tile = board.at({ q_idx: 2, r_idx: 2 })
		expect(tile).not.toBeNull()
		expect(tile?.terrain).toBe('grass')
	})

	it('returns null for out-of-range positions', () => {
		expect(board.at({ q_idx: -1, r_idx: 0 })).toBeNull()
		expect(board.at({ q_idx: 10, r_idx: 10 })).toBeNull()
	})

	it('contains reports board bounds', () => {
		expect(board.contains({ q_idx: 0, r_idx: 0 })).toBe(true)
		expect(board.contains({ q_idx: 4, r_idx: 4 })).toBe(true)
		expect(board.contains({ q_idx: -1, r_idx: 0 })).toBe(false)
		expect(board.contains({ q_idx: 5, r_idx: 0 })).toBe(false)
	})

	it('key formats positions as comma-separated indices', () => {
		expect(board.key({ q_idx: 3, r_idx: 1 })).toBe('3,1')
	})
})

describe('Board.neighborsOf', () => {
	const board = Board.from(createTestBoard(2))

	it('returns 6 neighbors for a center tile', () => {
		const neighbors = board.neighborsOf({ q_idx: 2, r_idx: 2 })
		expect(neighbors).toHaveLength(6)
	})

	it('returns fewer neighbors at a corner', () => {
		const neighbors = board.neighborsOf({ q_idx: 0, r_idx: 0 })
		expect(neighbors.length).toBeLessThan(6)
		expect(neighbors.length).toBeGreaterThan(0)
	})

	it('never includes the origin position itself', () => {
		const neighbors = board.neighborsOf({ q_idx: 2, r_idx: 2 })
		expect(neighbors.some((n) => n.q_idx === 2 && n.r_idx === 2)).toBe(false)
	})

	it('all returned neighbors are within board bounds', () => {
		const neighbors = board.neighborsOf({ q_idx: 2, r_idx: 2 })
		for (const pos of neighbors) {
			expect(board.contains(pos)).toBe(true)
		}
	})
})

describe('Board.distance', () => {
	const board = Board.from(createTestBoard(2))

	it('is zero for the same position', () => {
		const p = { q_idx: 2, r_idx: 2 }
		expect(board.distance(p, p)).toBe(0)
	})

	it('is 1 for adjacent tiles', () => {
		expect(board.distance({ q_idx: 2, r_idx: 2 }, { q_idx: 3, r_idx: 2 })).toBe(
			1
		)
	})

	it('is 2 for tiles two-away', () => {
		expect(board.distance({ q_idx: 2, r_idx: 2 }, { q_idx: 4, r_idx: 2 })).toBe(
			2
		)
	})

	it('is symmetric', () => {
		const a = { q_idx: 1, r_idx: 2 }
		const b = { q_idx: 3, r_idx: 4 }
		expect(board.distance(a, b)).toBe(board.distance(b, a))
	})
})

describe('Board.pushDestination', () => {
	const board = Board.from(createTestBoard(2))

	it('returns the neighbor of target that is one step away from the attacker', () => {
		const dest = board.pushDestination(
			{ q_idx: 2, r_idx: 2 },
			{ q_idx: 3, r_idx: 2 }
		)
		expect(dest).toEqual({ q_idx: 4, r_idx: 2 })
	})

	it('keeps the push 1 hex from the target even when the attacker is far away', () => {
		const target = { q_idx: 3, r_idx: 2 }
		const dest = board.pushDestination({ q_idx: 0, r_idx: 2 }, target)
		assert(dest)
		// Push step is one hex from the target.
		expect(board.cubeDistance(dest, target)).toBe(1)
	})

	it('may return an off-board position — caller checks contains()', () => {
		const edgeBoard = Board.from(createTestBoard(2))
		const target = { q_idx: 4, r_idx: 2 } // east edge
		const dest = edgeBoard.pushDestination({ q_idx: 3, r_idx: 2 }, target)
		assert(dest)
		expect(edgeBoard.contains(dest)).toBe(false)
	})

	it('returns null when the attacker and target share a tile', () => {
		const same = { q_idx: 2, r_idx: 2 }
		expect(board.pushDestination(same, same)).toBeNull()
	})
})

describe('Board.within', () => {
	const board = Board.from(createTestBoard(2))

	it('returns the 6 neighbors for range=1 at center', () => {
		const positions = board.within({ q_idx: 2, r_idx: 2 }, 1)
		expect(positions).toHaveLength(6)
	})

	it('excludes the center position', () => {
		const positions = board.within({ q_idx: 2, r_idx: 2 }, 1)
		expect(positions.some((p) => p.q_idx === 2 && p.r_idx === 2)).toBe(false)
	})

	it('returns more positions for larger range', () => {
		const r1 = board.within({ q_idx: 2, r_idx: 2 }, 1)
		const r2 = board.within({ q_idx: 2, r_idx: 2 }, 2)
		expect(r2.length).toBeGreaterThan(r1.length)
	})
})

describe('Board.update (immutability)', () => {
	it('does not mutate the source board', () => {
		const source = createTestBoard(2)
		const board = Board.from(source)
		const next = board.update({ q_idx: 2, r_idx: 2 }, { terrain: 'water' })
		expect(next.at({ q_idx: 2, r_idx: 2 })?.terrain).toBe('water')
		expect(board.at({ q_idx: 2, r_idx: 2 })?.terrain).toBe('grass')
	})
})

describe('Board.isAdjacentToBuilding', () => {
	it('returns true when any neighbor holds an item', () => {
		const tiles = createTestBoard(2)
		requireTestValue(tiles[2])[2] = {
			...requireTestValue(requireTestValue(tiles[2])[2]),
			item: createTestVillage('barbarians')
		}
		const board = Board.from(tiles)
		expect(board.isAdjacentToBuilding({ q_idx: 3, r_idx: 2 })).toBe(true)
	})

	it('returns false when no neighbor holds an item', () => {
		const board = Board.from(createTestBoard(2))
		expect(board.isAdjacentToBuilding({ q_idx: 2, r_idx: 2 })).toBe(false)
	})
})

describe('Board.perimeterSides', () => {
	it('marks every side as perimeter when range is empty', () => {
		const board = Board.from(createTestBoard(2))
		const sides = board.perimeterSides({ q_idx: 2, r_idx: 2 }, new Set())
		expect(sides).toHaveLength(6)
		expect(sides.every(Boolean)).toBe(true)
	})

	it('marks sides inside range as non-perimeter', () => {
		const board = Board.from(createTestBoard(2))
		const center = { q_idx: 2, r_idx: 2 }
		const neighborKeys = new Set(
			board.neighborsOf(center).map((p) => board.key(p))
		)
		const sides = board.perimeterSides(center, neighborKeys)
		expect(sides.every((s) => !s)).toBe(true)
	})
})

describe('canMoveTo', () => {
	it('allows a ready unit to move one tile', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		expect(Result.isSuccess(canMoveTo(gs, from, to))).toBe(true)
	})

	it('rejects a unit in "moved" mode with UnitNotReadyError', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman', { mode: 'moved' })
			}
		})
		const result = canMoveTo(gs, from, to)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('UnitNotReadyError')
	})

	it('allows a retreating unit to move once and marks it acted', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'seer')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'seer', { mode: 'retreat' })
			}
		})

		expect(Result.isSuccess(canMoveTo(gs, from, to))).toBe(true)
		const result = executeMovement(gs, from, to)
		assert(Result.isSuccess(result))
		expect(result.success.newGameState.units.unitStates[unit.id]?.mode).toBe(
			'acted'
		)
	})

	it('rejects moves with no unit at source', () => {
		const gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const result = canMoveTo(gs, from, to)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})

	it('rejects moving a unit the current player does not control', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const enemyUnit = createTestUnit('rogues', 'caveman')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit: enemyUnit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[enemyUnit.id]: createTestUnitState(from, 'caveman')
			}
		})
		// currentPlayerTribe is 'barbarians' — the rogue unit is not theirs.
		const moveCheck = canMoveTo(gs, from, to)
		assert(Result.isFailure(moveCheck))
		expect(moveCheck.failure._tag).toBe('InvalidTargetError')
		const execution = executeMovement(gs, from, to)
		assert(Result.isFailure(execution))
		expect(execution.failure._tag).toBe('InvalidTargetError')
	})

	it('rejects self-move', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		const result = canMoveTo(gs, from, from)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})

	it('rejects moving onto an occupied tile', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const a = createTestUnit('barbarians', 'caveman')
		const b = createTestUnit('rogues', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit: a })
		board = board.update(to, { unit: b })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[a.id]: createTestUnitState(from, 'caveman'),
				[b.id]: createTestUnitState(to, 'caveman')
			}
		})
		const result = canMoveTo(gs, from, to)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})

	it('rejects moves beyond movement budget with OutOfRangeError', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		// Caveman has movement=1, so 3 tiles away is out of range
		const far = { q_idx: 2, r_idx: 0 }
		const unit = createTestUnit('barbarians', 'caveman')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		const result = canMoveTo(gs, from, far)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('OutOfRangeError')
	})

	it('requires water_and_bomber before ordinary units can enter water', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const water = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit }).tiles
		board = Board.from(board).update(water, { terrain: 'water' }).tiles
		gs = withUnits(gs, {
			board,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})

		expect(Result.isFailure(canMoveTo(gs, from, water))).toBe(true)

		const researched = {
			...gs,
			playerStates: editPlayer(gs.playerStates, 'barbarians', (draft) => {
				draft.startResearch('water_and_bomber', 0)
				draft.completeResearch()
			})
		}

		expect(Result.isSuccess(canMoveTo(researched, from, water))).toBe(true)
	})

	it('water_and_bomber alone does not grant access to deep ocean', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const ocean = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit }).tiles
		board = Board.from(board).update(ocean, { terrain: 'ocean' }).tiles
		gs = withUnits(gs, {
			board,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})

		const withWaterTech = {
			...gs,
			playerStates: editPlayer(gs.playerStates, 'barbarians', (draft) => {
				draft.startResearch('water_and_bomber', 0)
				draft.completeResearch()
			})
		}
		expect(Result.isFailure(canMoveTo(withWaterTech, from, ocean))).toBe(true)
	})

	it('naval units cross both shallow water and deep ocean without tech', () => {
		let gs = createTestGameState()
		const water = { q_idx: 2, r_idx: 2 }
		const ocean = { q_idx: 3, r_idx: 2 }
		const tidebreaker = createTestUnit('barbarians', 'tidebreaker')
		let board = Board.from(gs.units.board).update(water, {
			terrain: 'water',
			unit: tidebreaker
		}).tiles
		board = Board.from(board).update(ocean, { terrain: 'ocean' }).tiles
		gs = withUnits(gs, {
			board,
			unitStates: {
				...gs.units.unitStates,
				[tidebreaker.id]: createTestUnitState(water, 'tidebreaker')
			}
		})

		expect(Result.isSuccess(canMoveTo(gs, water, ocean))).toBe(true)
	})

	it('ocean_and_admiral grants access to both shallow water and deep ocean', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const water = { q_idx: 3, r_idx: 2 }
		const ocean = { q_idx: 1, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit }).tiles
		board = Board.from(board).update(water, { terrain: 'water' }).tiles
		board = Board.from(board).update(ocean, { terrain: 'ocean' }).tiles
		gs = withUnits(gs, {
			board,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})

		const researched = {
			...gs,
			playerStates: editPlayer(gs.playerStates, 'barbarians', (draft) => {
				draft.startResearch('water_and_bomber', 0)
				draft.completeResearch()
				draft.startResearch('ocean_and_admiral', 0)
				draft.completeResearch()
			})
		}

		expect(Result.isSuccess(canMoveTo(researched, from, water))).toBe(true)
		expect(Result.isSuccess(canMoveTo(researched, from, ocean))).toBe(true)
	})

	it('sprinter tech grants sprinters +1 movement', () => {
		const from = { q_idx: 4, r_idx: 4 }
		const fourAway = { q_idx: 4, r_idx: 0 }
		const sprinter = createTestUnit('barbarians', 'sprinter')

		let baseline = createTestGameState({ board: createTestBoard(4) })
		baseline = withUnits(baseline, {
			board: Board.from(baseline.units.board).update(from, { unit: sprinter })
				.tiles,
			unitStates: {
				...baseline.units.unitStates,
				[sprinter.id]: createTestUnitState(from, 'sprinter')
			}
		})
		// Sprinter movement=3 — 4 hexes is out of reach
		expect(Result.isFailure(canMoveTo(baseline, from, fourAway))).toBe(true)

		const boosted = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					researchedTechs: ['sprinter' as const]
				}
			}
		}
		// With sprinter: movement=4 — now reachable
		expect(Result.isSuccess(canMoveTo(boosted, from, fourAway))).toBe(true)
	})

	it('requires climbing to enter a mountain', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const mountain = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(mountain, { isMountain: true })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		expect(Result.isFailure(canMoveTo(gs, from, mountain))).toBe(true)

		const climber = {
			...gs,
			playerStates: {
				...gs.playerStates,
				barbarians: {
					...requireTestValue(gs.playerStates.barbarians),
					researchedTechs: ['climbing' as const, 'mobility_mastery' as const]
				}
			}
		}
		expect(Result.isSuccess(canMoveTo(climber, from, mountain))).toBe(true)
	})

	it('stone terrain alone (non-mountain) does not require climbing', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const stone = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(stone, { terrain: 'stone', isMountain: false })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		expect(Result.isSuccess(canMoveTo(gs, from, stone))).toBe(true)
	})

	it('counts mountain entry as 2 movement', () => {
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 3, r_idx: 3 }
		const mountain = { q_idx: 4, r_idx: 3 }
		const beyondMountain = { q_idx: 5, r_idx: 3 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(mountain, { isMountain: true })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = {
			...gs,
			playerStates: {
				...gs.playerStates,
				barbarians: {
					...requireTestValue(gs.playerStates.barbarians),
					researchedTechs: ['climbing' as const, 'mobility_mastery' as const]
				}
			}
		}

		expect(Result.isFailure(canMoveTo(gs, from, beyondMountain))).toBe(true)
	})

	it('frostlord adjacency reduces enemy movement by 1', () => {
		let gs = createTestGameState({ board: createTestBoard(4) })
		const from = { q_idx: 4, r_idx: 4 }
		const twoAway = { q_idx: 4, r_idx: 2 }
		const enemyAdj = { q_idx: 5, r_idx: 4 }

		const seer = createTestUnit('barbarians', 'seer')
		const frost = createTestUnit('rogues', 'frostlord')
		let board = Board.from(gs.units.board).update(from, { unit: seer })
		board = board.update(enemyAdj, { unit: frost })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[seer.id]: createTestUnitState(from, 'seer'),
				[frost.id]: createTestUnitState(enemyAdj, 'frostlord')
			}
		})
		// Seer movement=2 normally; frostlord debuff → 1
		expect(Result.isFailure(canMoveTo(gs, from, twoAway))).toBe(true)
	})
})

describe('canMoveTo — obstacles', () => {
	function withFlyingPassive(
		gs: ReturnType<typeof createTestGameState>,
		pos: { q_idx: number; r_idx: number }
	): ReturnType<typeof createTestGameState> {
		const board = Board.from(gs.units.board)
		const tile = board.at(pos)
		if (!tile?.unit) {
			return gs
		}
		const flyingUnit = {
			...tile.unit,
			stats: { ...tile.unit.stats, passive: 'flying' as const }
		}
		return {
			...gs,
			units: {
				...gs.units,
				board: board.update(pos, { unit: flyingUnit }).tiles
			}
		}
	}

	it('rejects a ground unit moving onto an obstacle tile', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const blocked = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(blocked, { obstacle: 'boulder' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})

		const result = canMoveTo(gs, from, blocked)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('InvalidTargetError')
	})

	it('allows a flying unit to stop on an obstacle tile', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const blocked = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(blocked, { obstacle: 'boulder' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)

		expect(Result.isSuccess(canMoveTo(gs, from, blocked))).toBe(true)
	})

	it('prevents ground pathfinding from transiting through an obstacle', () => {
		// Movement=2 seer can normally reach two tiles away. Placing an
		// obstacle on the only connecting tile must make the destination
		// unreachable for a ground unit.
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 3, r_idx: 3 }
		const between = { q_idx: 4, r_idx: 3 }
		const beyond = { q_idx: 5, r_idx: 3 }
		const seer = createTestUnit('barbarians', 'seer')
		let board = Board.from(gs.units.board).update(from, { unit: seer })
		board = board.update(between, { obstacle: 'boulder' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[seer.id]: createTestUnitState(from, 'seer')
			}
		})

		const result = canMoveTo(gs, from, beyond)
		assert(Result.isFailure(result))
		expect(result.failure._tag).toBe('OutOfRangeError')
	})

	it('flying transits through obstacle tiles to reach a clear destination', () => {
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 3, r_idx: 3 }
		const between = { q_idx: 4, r_idx: 3 }
		const beyond = { q_idx: 5, r_idx: 3 }
		const seer = createTestUnit('barbarians', 'seer')
		let board = Board.from(gs.units.board).update(from, { unit: seer })
		board = board.update(between, { obstacle: 'boulder' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[seer.id]: createTestUnitState(from, 'seer')
			}
		})
		gs = withFlyingPassive(gs, from)

		expect(Result.isSuccess(canMoveTo(gs, from, beyond))).toBe(true)
	})
})

describe('canMoveTo — flying passive', () => {
	function withFlyingPassive(
		gs: ReturnType<typeof createTestGameState>,
		pos: { q_idx: number; r_idx: number }
	): ReturnType<typeof createTestGameState> {
		const board = Board.from(gs.units.board)
		const tile = board.at(pos)
		if (!tile?.unit) {
			return gs
		}
		const flyingUnit = {
			...tile.unit,
			stats: { ...tile.unit.stats, passive: 'flying' as const }
		}
		return {
			...gs,
			units: {
				...gs.units,
				board: board.update(pos, { unit: flyingUnit }).tiles
			}
		}
	}

	it('allows a flying unit to cross a mountain to a land destination without Climbing', () => {
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 3, r_idx: 3 }
		const mountain = { q_idx: 4, r_idx: 3 }
		const beyondMountain = { q_idx: 5, r_idx: 3 }
		const seer = createTestUnit('barbarians', 'seer')
		let board = Board.from(gs.units.board).update(from, { unit: seer })
		board = board.update(mountain, { isMountain: true })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[seer.id]: createTestUnitState(from, 'seer')
			}
		})
		gs = withFlyingPassive(gs, from)

		// Without flying, the mountain blocks (no climbing) and costs 2 anyway.
		// With flying, transit is unrestricted at 1 cost — beyond reachable.
		expect(Result.isSuccess(canMoveTo(gs, from, beyondMountain))).toBe(true)
	})

	it('rejects a flying unit stopping on a mountain without Climbing', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const mountain = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(mountain, { isMountain: true })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)

		expect(Result.isFailure(canMoveTo(gs, from, mountain))).toBe(true)
	})

	it('allows a flying unit to stop on a mountain with Climbing', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const mountain = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(mountain, { isMountain: true })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)
		gs = {
			...gs,
			playerStates: {
				...gs.playerStates,
				barbarians: {
					...requireTestValue(gs.playerStates.barbarians),
					researchedTechs: ['climbing' as const]
				}
			}
		}

		expect(Result.isSuccess(canMoveTo(gs, from, mountain))).toBe(true)
	})

	it('rejects a flying unit stopping on shallow water without Water & Bomber', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const water = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(water, { terrain: 'water' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)

		expect(Result.isFailure(canMoveTo(gs, from, water))).toBe(true)
	})

	it('allows a flying unit to stop on shallow water with Water & Bomber', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const water = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(water, { terrain: 'water' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)
		gs = {
			...gs,
			playerStates: editPlayer(gs.playerStates, 'barbarians', (draft) => {
				draft.startResearch('water_and_bomber', 0)
				draft.completeResearch()
			})
		}

		expect(Result.isSuccess(canMoveTo(gs, from, water))).toBe(true)
	})

	it('rejects a flying unit stopping on deep ocean without Ocean & Admiral', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const ocean = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(ocean, { terrain: 'ocean' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)
		// water_and_bomber alone doesn't open ocean
		gs = {
			...gs,
			playerStates: editPlayer(gs.playerStates, 'barbarians', (draft) => {
				draft.startResearch('water_and_bomber', 0)
				draft.completeResearch()
			})
		}

		expect(Result.isFailure(canMoveTo(gs, from, ocean))).toBe(true)
	})

	it('allows a flying unit to stop on deep ocean with Ocean & Admiral', () => {
		let gs = createTestGameState({ board: createTestBoard(2) })
		const from = { q_idx: 2, r_idx: 2 }
		const ocean = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit })
		board = board.update(ocean, { terrain: 'ocean' })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})
		gs = withFlyingPassive(gs, from)
		gs = {
			...gs,
			playerStates: editPlayer(gs.playerStates, 'barbarians', (draft) => {
				draft.startResearch('water_and_bomber', 0)
				draft.completeResearch()
				draft.startResearch('ocean_and_admiral', 0)
				draft.completeResearch()
			})
		}

		expect(Result.isSuccess(canMoveTo(gs, from, ocean))).toBe(true)
	})

	it('uses ground movement for flying units even when starting on water', () => {
		// Flying ignores the land/water movement split — the budget is the
		// ground `movement` stat. A seer (movement=2, waterMovement=1)
		// starting on water can still reach a land tile two hexes away.
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 3, r_idx: 3 }
		const land = { q_idx: 5, r_idx: 3 }
		const seer = createTestUnit('barbarians', 'seer')
		const board = Board.from(gs.units.board).update(from, {
			terrain: 'water',
			unit: seer
		})
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[seer.id]: createTestUnitState(from, 'seer')
			}
		})
		gs = withFlyingPassive(gs, from)

		// seer.movement=2 → reachable; seer.waterMovement=1 → not.
		// If the budget chose waterMovement for a flying unit, this would fail.
		expect(Result.isSuccess(canMoveTo(gs, from, land))).toBe(true)
	})

	it('allows a flying unit to cross water and a mountain to a land destination', () => {
		let gs = createTestGameState({ board: createTestBoard(3) })
		const from = { q_idx: 2, r_idx: 3 }
		const water = { q_idx: 3, r_idx: 3 }
		const mountain = { q_idx: 4, r_idx: 3 }
		const land = { q_idx: 5, r_idx: 3 }
		const seer = createTestUnit('barbarians', 'seer')
		let board = Board.from(gs.units.board).update(from, { unit: seer })
		board = board.update(water, { terrain: 'water' })
		board = board.update(mountain, { isMountain: true })
		// seer has movement=2; we need 3 to reach land 3 tiles away,
		// so add mobility_mastery to grant +1 movement
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[seer.id]: createTestUnitState(from, 'seer')
			}
		})
		gs = withFlyingPassive(gs, from)
		gs = {
			...gs,
			playerStates: {
				...gs.playerStates,
				barbarians: {
					...requireTestValue(gs.playerStates.barbarians),
					researchedTechs: ['mobility_mastery' as const]
				}
			}
		}

		// Flying: water and mountain are in transit → 1 cost each → reachable
		expect(Result.isSuccess(canMoveTo(gs, from, land))).toBe(true)
	})
})

describe('executeMovement', () => {
	it('moves the unit and marks it as moved', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		gs = withUnits(gs, {
			board: Board.from(gs.units.board).update(from, { unit }).tiles,
			unitStates: {
				...gs.units.unitStates,
				[unit.id]: createTestUnitState(from, 'caveman')
			}
		})

		const result = executeMovement(gs, from, to)
		assert(Result.isSuccess(result))
		const next = result.success.newGameState
		expect(
			requireTestValue(next.units.board[from.r_idx])[from.q_idx]?.unit
		).toBeNull()
		expect(
			requireTestValue(next.units.board[to.r_idx])[to.q_idx]?.unit?.id
		).toBe(unit.id)
		expect(next.units.unitStates[unit.id]?.mode).toBe('moved')
	})

	it('errors when the target is occupied', () => {
		let gs = createTestGameState()
		const from = { q_idx: 2, r_idx: 2 }
		const to = { q_idx: 3, r_idx: 2 }
		const a = createTestUnit('barbarians', 'caveman')
		const b = createTestUnit('rogues', 'caveman')
		let board = Board.from(gs.units.board).update(from, { unit: a })
		board = board.update(to, { unit: b })
		gs = withUnits(gs, {
			board: board.tiles,
			unitStates: {
				...gs.units.unitStates,
				[a.id]: createTestUnitState(from, 'caveman'),
				[b.id]: createTestUnitState(to, 'caveman')
			}
		})
		const result = executeMovement(gs, from, to)
		expect(Result.isFailure(result)).toBe(true)
	})
})

describe('calculateBoardDimensions', () => {
	it('returns positive width/height and correct radius', () => {
		const { width, height, radius } = calculateBoardDimensions(7, 40, 1)
		expect(radius).toBe(3)
		expect(width).toBeGreaterThan(0)
		expect(height).toBeGreaterThan(0)
	})
})
