import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage
} from '../test/game-test-helpers'
import { Result } from 'effect'
import { positionKey } from '../board/board'
import { executeMovement } from '../units/world-movement'
import { resolveCombat } from '../combat/resolve'
import { GameHex } from '../board/hex-utils'
import { type GameState } from '../game'
import { type UnitStateRecord } from '../unit-state-utils'
import {
	commitExploration,
	mergeIncomingExploration,
	snapshotFor
} from './snapshot'
import {
	type FogProjectionError,
	SchemaViolationError,
	ViewerTribeMissingError
} from './errors'
import { validateFilteredGameState, type FilteredGameState } from './schema'

const RADIUS = 2

function expectOk(
	result: Result.Result<FilteredGameState, FogProjectionError>
): FilteredGameState {
	if (Result.isFailure(result)) {
		throw new Error(
			`expected Ok, got ${result.failure._tag}: ${result.failure.message}`
		)
	}
	return result.success
}

function project(state: GameState, tribe: 'barbarians' | 'rogues') {
	return snapshotFor(state, tribe).projected
}

describe('snapshotFor — projected output', () => {
	it('never leaks the seed', () => {
		const gameState = createTestGameState({ seed: 0xde_ad_be_ef })

		const filtered = expectOk(project(gameState, 'barbarians'))

		expect('seed' in filtered).toBe(false)
		expect(JSON.stringify(filtered)).not.toContain('seed')
	})

	it('hides enemy units on tiles the viewer has never seen', () => {
		const board = createTestBoard(RADIUS)
		const enemyPos = { q_idx: 0, r_idx: 0 }
		const enemyUnit = createTestUnit('rogues', 'caveman')
		requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx]
			),
			unit: enemyUnit
		}
		const unitStates: UnitStateRecord = {
			[enemyUnit.id]: createTestUnitState(enemyPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })

		const filtered = expectOk(project(gameState, 'barbarians'))

		expect(filtered.units.unitStates[enemyUnit.id]).toBeUndefined()
		const enemyTile = requireTestValue(filtered.units.board[enemyPos.r_idx])[
			enemyPos.q_idx
		]
		expect(enemyTile?.item).toBeNull()
		expect(enemyTile?.unit).toBeNull()
		expect(enemyTile?.terrain).toBeNull()
		expect(enemyTile?.isMountain).toBe(false)
		expect(enemyTile?.obstacle).toBeNull()
	})

	it('reveals enemy units on tiles the viewer has previously explored', () => {
		const board = createTestBoard(RADIUS)
		const enemyPos = { q_idx: 0, r_idx: 0 }
		const enemyUnit = createTestUnit('rogues', 'caveman')
		requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx]
			),
			unit: enemyUnit
		}
		const unitStates: UnitStateRecord = {
			[enemyUnit.id]: createTestUnitState(enemyPos, 'caveman')
		}
		const baseline = createTestGameState({ board, unitStates })
		const gameState: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					exploration: { [positionKey(enemyPos)]: true }
				}
			}
		}

		const filtered = expectOk(project(gameState, 'barbarians'))

		const enemyTile = requireTestValue(filtered.units.board[enemyPos.r_idx])[
			enemyPos.q_idx
		]
		expect(enemyTile?.terrain).not.toBeNull()
		expect(enemyTile?.unit?.id).toBe(enemyUnit.id)
		expect(filtered.units.unitStates[enemyUnit.id]).toBeDefined()
	})

	it('keeps own units even with no sight-provider nearby', () => {
		const board = createTestBoard(RADIUS)
		const ownPos = { q_idx: 2, r_idx: 2 }
		const ownUnit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[ownPos.r_idx])[ownPos.q_idx] = {
			...requireTestValue(requireTestValue(board[ownPos.r_idx])[ownPos.q_idx]),
			unit: ownUnit
		}
		const unitStates: UnitStateRecord = {
			[ownUnit.id]: createTestUnitState(ownPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })

		const filtered = expectOk(project(gameState, 'barbarians'))

		expect(filtered.units.unitStates[ownUnit.id]).toBeDefined()
	})

	it('strips exploration and researchInProgress for other tribes', () => {
		const baseline = createTestGameState()
		const gameState: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				rogues: {
					...requireTestValue(baseline.playerStates.rogues),
					exploration: { '1,1': true },
					researchInProgress: {
						tech: 'mineral_mastery',
						turnsRemaining: 3
					}
				}
			}
		}

		const filtered = expectOk(project(gameState, 'barbarians'))

		const filteredRogues = filtered.playerStates.rogues
		assert(filteredRogues)
		expect(filteredRogues.exploration).toEqual({})
		expect(filteredRogues.researchInProgress).toBeNull()
	})

	it('preserves the viewer tribe exploration and researchInProgress', () => {
		const baseline = createTestGameState()
		const gameState: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					exploration: { '2,2': true },
					researchInProgress: {
						tech: 'mineral_mastery',
						turnsRemaining: 2
					}
				}
			}
		}

		const filtered = expectOk(project(gameState, 'barbarians'))

		const filteredBarbarians = filtered.playerStates.barbarians
		assert(filteredBarbarians)
		expect(filteredBarbarians.exploration).toEqual({
			'2,2': true
		})
		expect(filteredBarbarians.researchInProgress).toEqual({
			tech: 'mineral_mastery',
			turnsRemaining: 2
		})
	})

	it('output satisfies the FilteredGameState schema', () => {
		const gameState = createTestGameState()

		const filtered = expectOk(project(gameState, 'barbarians'))

		const decoded = validateFilteredGameState(filtered, 'barbarians')
		expect(Result.isSuccess(decoded)).toBe(true)
	})

	it('schema accepts knockback as a unit passive', () => {
		const board = createTestBoard(RADIUS)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			unit: { ...unit, stats: { ...unit.stats, passive: 'knockback' } }
		}
		const gameState = createTestGameState({
			board,
			unitStates: {
				[unit.id]: createTestUnitState(unitPos, 'caveman')
			}
		})
		const filtered = expectOk(project(gameState, 'barbarians'))

		const decoded = validateFilteredGameState(filtered, 'barbarians')
		expect(Result.isSuccess(decoded)).toBe(true)
	})

	it('schema accepts the flying passive on a projected unit', () => {
		const board = createTestBoard(RADIUS)
		const flyerPos = { q_idx: 2, r_idx: 2 }
		const flyer = createTestUnit('barbarians', 'caveman')
		const flyerWithFlying = {
			...flyer,
			stats: { ...flyer.stats, passive: 'flying' as const }
		}
		requireTestValue(board[flyerPos.r_idx])[flyerPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[flyerPos.r_idx])[flyerPos.q_idx]
			),
			unit: flyerWithFlying
		}
		const gameState = createTestGameState({
			board,
			unitStates: { [flyer.id]: createTestUnitState(flyerPos, 'caveman') }
		})

		const filtered = expectOk(project(gameState, 'barbarians'))
		const decoded = validateFilteredGameState(filtered, 'barbarians')
		expect(Result.isSuccess(decoded)).toBe(true)
	})

	it('schema accepts ocean terrain on a projected tile', () => {
		const board = createTestBoard(RADIUS)
		const oceanPos = { q_idx: 0, r_idx: 0 }
		requireTestValue(board[oceanPos.r_idx])[oceanPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[oceanPos.r_idx])[oceanPos.q_idx]
			),
			terrain: 'ocean'
		}
		const gameState = createTestGameState({ board })
		const filtered = expectOk(project(gameState, 'barbarians'))

		const decoded = validateFilteredGameState(filtered, 'barbarians')
		expect(Result.isSuccess(decoded)).toBe(true)
	})

	it('schema rejects outputs that leak another tribe exploration', () => {
		const gameState = createTestGameState()
		const filtered = expectOk(project(gameState, 'barbarians'))
		const tampered = {
			...filtered,
			playerStates: {
				...filtered.playerStates,
				rogues: {
					...requireTestValue(filtered.playerStates.rogues),
					exploration: { '0,0': true as const }
				}
			}
		}

		const result = validateFilteredGameState(tampered, 'barbarians')
		expect(Result.isFailure(result)).toBe(true)
	})

	it('schema rejects outputs that leak another tribe researchInProgress', () => {
		const gameState = createTestGameState()
		const filtered = expectOk(project(gameState, 'barbarians'))
		const tampered = {
			...filtered,
			playerStates: {
				...filtered.playerStates,
				rogues: {
					...requireTestValue(filtered.playerStates.rogues),
					researchInProgress: {
						tech: 'mineral_mastery' as const,
						turnsRemaining: 1
					}
				}
			}
		}

		const result = validateFilteredGameState(tampered, 'barbarians')
		expect(Result.isFailure(result)).toBe(true)
	})
})

describe('snapshotFor — projection errors', () => {
	it('returns ViewerTribeMissingError when the viewer tribe has no state', () => {
		const baseline = createTestGameState()
		const rest = { ...baseline.playerStates }
		Reflect.deleteProperty(rest, 'barbarians')
		const gameState: GameState = {
			...baseline,
			playerStates: rest
		}

		const result = project(gameState, 'barbarians')

		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure).toBeInstanceOf(ViewerTribeMissingError)
		expect(result.failure._tag).toBe('ViewerTribeMissingError')
		assert(result.failure._tag === 'ViewerTribeMissingError')
		expect(result.failure.tribe).toBe('barbarians')
	})

	it('returns SchemaViolationError with a path pointing at the bad field', () => {
		const baseline = createTestGameState()
		const gameState: GameState = {
			...baseline,
			turn: -1
		}

		const result = project(gameState, 'barbarians')

		expect(Result.isFailure(result)).toBe(true)
		assert(Result.isFailure(result))
		expect(result.failure).toBeInstanceOf(SchemaViolationError)
		assert(result.failure._tag === 'SchemaViolationError')
		expect(result.failure.path).toContain('turn')
	})
})

describe('snapshotFor — determinism & visibility', () => {
	it('is deterministic: same (state, tribe) yields identical visibleTileIds', () => {
		const board = createTestBoard(RADIUS)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(unitPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })

		const a = snapshotFor(gameState, 'barbarians')
		const b = snapshotFor(gameState, 'barbarians')

		expect(
			[...a.visibleTileIds].toSorted((left, right) => left.localeCompare(right))
		).toEqual(
			[...b.visibleTileIds].toSorted((left, right) => left.localeCompare(right))
		)
	})

	it('is deterministic: same (state, tribe) yields identical projection', () => {
		const gameState = createTestGameState()

		const a = expectOk(snapshotFor(gameState, 'barbarians').projected)
		const b = expectOk(snapshotFor(gameState, 'barbarians').projected)

		expect(a).toEqual(b)
	})

	it('projection only contains tiles in visibleTileIds (or own-unit tiles)', () => {
		const board = createTestBoard(RADIUS)
		const ownPos = { q_idx: 2, r_idx: 2 }
		const enemyPos = { q_idx: 0, r_idx: 0 }
		const ownUnit = createTestUnit('barbarians', 'caveman')
		const enemyUnit = createTestUnit('rogues', 'caveman')
		requireTestValue(board[ownPos.r_idx])[ownPos.q_idx] = {
			...requireTestValue(requireTestValue(board[ownPos.r_idx])[ownPos.q_idx]),
			unit: ownUnit
		}
		requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[enemyPos.r_idx])[enemyPos.q_idx]
			),
			unit: enemyUnit
		}
		const unitStates: UnitStateRecord = {
			[ownUnit.id]: createTestUnitState(ownPos, 'caveman'),
			[enemyUnit.id]: createTestUnitState(enemyPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })

		const snap = snapshotFor(gameState, 'barbarians')
		const projected = expectOk(snap.projected)

		// Any tile holding a unit/item in the projection must be in visibleTileIds.
		for (let r_idx = 0; r_idx < projected.units.board.length; r_idx++) {
			const row = requireTestValue(projected.units.board[r_idx])
			for (let q_idx = 0; q_idx < row.length; q_idx++) {
				const tile = row[q_idx]
				if (!tile) {
					continue
				}
				expect(
					(tile.unit === null && tile.item === null) ||
						snap.visibleTileIds.has(positionKey({ q_idx, r_idx }))
				).toBe(true)
			}
		}

		// Every projected unitState must be either own tribe or on a visible tile.
		for (const us of Object.values(projected.units.unitStates)) {
			const tile = gameState.units.board[us.position.r_idx]?.[us.position.q_idx]
			const ownTribe = tile?.unit?.tribe === 'barbarians'
			expect(
				ownTribe || snap.visibleTileIds.has(positionKey(us.position))
			).toBe(true)
		}
	})

	it('cross-tribe: a tribe never sees data outside its own snapshot visible set', () => {
		const board = createTestBoard(RADIUS)
		const barbarianPos = { q_idx: 2, r_idx: 2 }
		const roguesPos = { q_idx: 0, r_idx: 0 }
		const barbarianUnit = createTestUnit('barbarians', 'caveman')
		const roguesUnit = createTestUnit('rogues', 'caveman')
		requireTestValue(board[barbarianPos.r_idx])[barbarianPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[barbarianPos.r_idx])[barbarianPos.q_idx]
			),
			unit: barbarianUnit
		}
		requireTestValue(board[roguesPos.r_idx])[roguesPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[roguesPos.r_idx])[roguesPos.q_idx]
			),
			unit: roguesUnit
		}
		const unitStates: UnitStateRecord = {
			[barbarianUnit.id]: createTestUnitState(barbarianPos, 'caveman'),
			[roguesUnit.id]: createTestUnitState(roguesPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })

		const barbariansSnap = snapshotFor(gameState, 'barbarians')
		const roguesSnap = snapshotFor(gameState, 'rogues')
		const barbarianView = expectOk(barbariansSnap.projected)
		const roguesView = expectOk(roguesSnap.projected)

		expect(barbarianView.units.unitStates[barbarianUnit.id]).toBeDefined()
		expect(roguesView.units.unitStates[roguesUnit.id]).toBeDefined()
		// A distant enemy unit is scrubbed from each viewer's snapshot.
		expect(barbarianView.units.unitStates[roguesUnit.id]).toBeUndefined()
		expect(roguesView.units.unitStates[barbarianUnit.id]).toBeUndefined()
	})

	it('earth mastery expands ranged unit visibility by 1 tile', () => {
		const board = createTestBoard(RADIUS)
		const archerPos = { q_idx: 2, r_idx: 2 }
		const extraSightPos = { q_idx: 2, r_idx: 0 }
		const archer = createTestUnit('barbarians', 'archer')
		requireTestValue(board[archerPos.r_idx])[archerPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[archerPos.r_idx])[archerPos.q_idx]
			),
			unit: archer
		}
		const unitStates: UnitStateRecord = {
			[archer.id]: createTestUnitState(archerPos, 'archer')
		}
		const baseline = createTestGameState({ board, unitStates })
		const mastered: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					researchedTechs: ['earth_mastery']
				}
			}
		}

		const before = snapshotFor(baseline, 'barbarians')
		const after = snapshotFor(mastered, 'barbarians')

		expect(before.visibleTileIds.has(positionKey(extraSightPos))).toBe(false)
		expect(after.visibleTileIds.has(positionKey(extraSightPos))).toBe(true)
	})

	it('flying passive grants +1 visibility range', () => {
		const board = createTestBoard(RADIUS)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const extraSightPos = { q_idx: 2, r_idx: 0 }
		const caveman = createTestUnit('barbarians', 'caveman')
		const flyer = {
			...caveman,
			stats: { ...caveman.stats, passive: 'flying' as const }
		}
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			unit: flyer
		}
		const unitStates: UnitStateRecord = {
			[caveman.id]: createTestUnitState(unitPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })

		// Without flying, caveman sight=1 — extraSightPos is 2 tiles away.
		const baselineBoard = createTestBoard(RADIUS)
		requireTestValue(baselineBoard[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(baselineBoard[unitPos.r_idx])[unitPos.q_idx]
			),
			unit: caveman
		}
		const baseline = createTestGameState({ board: baselineBoard, unitStates })
		expect(
			snapshotFor(baseline, 'barbarians').visibleTileIds.has(
				positionKey(extraSightPos)
			)
		).toBe(false)

		// With flying, +1 sight reveals it.
		expect(
			snapshotFor(gameState, 'barbarians').visibleTileIds.has(
				positionKey(extraSightPos)
			)
		).toBe(true)
	})

	it('mountain tiles grant +1 visibility range regardless of terrain', () => {
		const board = createTestBoard(RADIUS)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const extraSightPos = { q_idx: 2, r_idx: 0 }
		const caveman = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			terrain: 'grass',
			isMountain: true,
			unit: caveman
		}
		const unitStates: UnitStateRecord = {
			[caveman.id]: createTestUnitState(unitPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })
		const snap = snapshotFor(gameState, 'barbarians')

		expect(snap.visibleTileIds.has(positionKey(extraSightPos))).toBe(true)
	})

	it('stone terrain without isMountain does not grant +1 visibility', () => {
		const board = createTestBoard(RADIUS)
		const unitPos = { q_idx: 2, r_idx: 2 }
		const extraSightPos = { q_idx: 2, r_idx: 0 }
		const caveman = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[unitPos.r_idx])[unitPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[unitPos.r_idx])[unitPos.q_idx]
			),
			terrain: 'stone',
			isMountain: false,
			unit: caveman
		}
		const unitStates: UnitStateRecord = {
			[caveman.id]: createTestUnitState(unitPos, 'caveman')
		}
		const gameState = createTestGameState({ board, unitStates })
		const snap = snapshotFor(gameState, 'barbarians')

		expect(snap.visibleTileIds.has(positionKey(extraSightPos))).toBe(false)
	})
})

describe('commitExploration', () => {
	it('takes only the snapshot — the snapshot carries its source state', () => {
		const board = createTestBoard(RADIUS)
		const villagePos = { q_idx: 2, r_idx: 2 }
		requireTestValue(board[villagePos.r_idx])[villagePos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[villagePos.r_idx])[villagePos.q_idx]
			),
			item: createTestVillage('barbarians', { range: 1 })
		}
		const gameState = createTestGameState({ board })

		const snap = snapshotFor(gameState, 'barbarians')
		const committed = commitExploration(snap)

		expect(
			requireTestValue(committed.playerStates.barbarians).exploration[
				positionKey(villagePos)
			]
		).toBe(true)
	})

	it('merges currently visible tiles into the viewer tribe exploration', () => {
		const board = createTestBoard(RADIUS)
		const villagePos = { q_idx: 2, r_idx: 2 }
		requireTestValue(board[villagePos.r_idx])[villagePos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[villagePos.r_idx])[villagePos.q_idx]
			),
			item: createTestVillage('barbarians', { range: 1 })
		}
		const gameState = createTestGameState({ board })

		const snap = snapshotFor(gameState, 'barbarians')
		const committed = commitExploration(snap)

		expect(
			requireTestValue(committed.playerStates.barbarians).exploration[
				positionKey(villagePos)
			]
		).toBe(true)
	})

	it('is idempotent on already-explored tiles', () => {
		const board = createTestBoard(RADIUS)
		const baseline = createTestGameState({ board })
		const gameState: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					exploration: { '0,0': true }
				}
			}
		}

		const snap = snapshotFor(gameState, 'barbarians')
		const once = commitExploration(snap)
		const twice = commitExploration(snapshotFor(once, 'barbarians'))

		expect(
			requireTestValue(once.playerStates.barbarians).exploration['0,0']
		).toBe(true)
		expect(requireTestValue(twice.playerStates.barbarians).exploration).toEqual(
			requireTestValue(once.playerStates.barbarians).exploration
		)
	})

	it('after a move, projected state and exploration both track the new position', () => {
		const board = createTestBoard(RADIUS)
		const startPos = { q_idx: 2, r_idx: 2 }
		const targetPos = { q_idx: 3, r_idx: 2 }
		const unit = createTestUnit('barbarians', 'caveman')
		requireTestValue(board[startPos.r_idx])[startPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[startPos.r_idx])[startPos.q_idx]
			),
			unit
		}
		const unitStates: UnitStateRecord = {
			[unit.id]: createTestUnitState(startPos, 'caveman')
		}
		const before = createTestGameState({ board, unitStates })

		const moveResult = executeMovement(before, startPos, targetPos)
		if (Result.isFailure(moveResult)) {
			throw new Error('move failed')
		}
		const afterMove = moveResult.success.newGameState

		const snap = snapshotFor(afterMove, 'barbarians')
		const committed = commitExploration(snap)
		const filtered = expectOk(snapshotFor(committed, 'barbarians').projected)

		// Projected board matches the post-move position.
		expect(
			requireTestValue(filtered.units.board[targetPos.r_idx])[targetPos.q_idx]
				?.unit?.id
		).toBe(unit.id)
		// Exploration now includes the new position's key.
		expect(
			requireTestValue(committed.playerStates.barbarians).exploration[
				positionKey(targetPos)
			]
		).toBe(true)
	})

	it('kill-and-occupy: visibility reflects the final attacker position', () => {
		const board = createTestBoard(RADIUS)
		const attackerPos = { q_idx: 2, r_idx: 2 }
		const defenderPos = { q_idx: 3, r_idx: 2 }
		const attacker = createTestUnit('barbarians', 'caveman')
		const defender = createTestUnit('rogues', 'caveman')
		requireTestValue(board[attackerPos.r_idx])[attackerPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[attackerPos.r_idx])[attackerPos.q_idx]
			),
			unit: attacker
		}
		requireTestValue(board[defenderPos.r_idx])[defenderPos.q_idx] = {
			...requireTestValue(
				requireTestValue(board[defenderPos.r_idx])[defenderPos.q_idx]
			),
			unit: defender
		}
		const unitStates: UnitStateRecord = {
			[attacker.id]: createTestUnitState(attackerPos, 'caveman'),
			[defender.id]: createTestUnitState(defenderPos, 'caveman', { health: 1 })
		}
		const before = createTestGameState({ board, unitStates })

		const combat = resolveCombat(before, {
			from: attackerPos,
			to: defenderPos,
			grid: { gameHex: GameHex, radius: RADIUS }
		})
		if (Result.isFailure(combat)) {
			throw new Error('combat failed')
		}
		const after = combat.success.state

		const snap = snapshotFor(after, 'barbarians')

		// In any case, either the attacker's original tile or the defender tile
		// should be visible — the snapshot reflects post-combat state.
		expect(
			snap.visibleTileIds.has(positionKey(defenderPos)) ||
				snap.visibleTileIds.has(positionKey(attackerPos))
		).toBe(true)

		// If the attacker occupied the defender tile, visibility from that tile
		// should include the defender position.
		const occupyingTile = requireTestValue(
			after.units.board[defenderPos.r_idx]
		)[defenderPos.q_idx]
		expect(
			occupyingTile?.unit?.id !== attacker.id ||
				snap.visibleTileIds.has(positionKey(defenderPos))
		).toBe(true)
	})
})

describe('mergeIncomingExploration', () => {
	it('adds tiles from the delta to the tribe exploration', () => {
		const baseline = createTestGameState()
		const gameState: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					exploration: {}
				}
			}
		}

		const merged = mergeIncomingExploration(gameState, {
			tribe: 'barbarians',
			tiles: ['1,1', '2,2']
		})

		expect(
			requireTestValue(merged.playerStates.barbarians).exploration['1,1']
		).toBe(true)
		expect(
			requireTestValue(merged.playerStates.barbarians).exploration['2,2']
		).toBe(true)
	})

	it('preserves locally-explored tiles that are not in the delta', () => {
		const baseline = createTestGameState()
		const gameState: GameState = {
			...baseline,
			playerStates: {
				...baseline.playerStates,
				barbarians: {
					...requireTestValue(baseline.playerStates.barbarians),
					exploration: { '0,0': true, '5,5': true }
				}
			}
		}

		const merged = mergeIncomingExploration(gameState, {
			tribe: 'barbarians',
			tiles: ['1,1']
		})

		expect(
			requireTestValue(merged.playerStates.barbarians).exploration['0,0']
		).toBe(true)
		expect(
			requireTestValue(merged.playerStates.barbarians).exploration['5,5']
		).toBe(true)
		expect(
			requireTestValue(merged.playerStates.barbarians).exploration['1,1']
		).toBe(true)
	})

	it('is idempotent across replays', () => {
		const baseline = createTestGameState()
		const delta = { tribe: 'barbarians' as const, tiles: ['3,3'] }

		const once = mergeIncomingExploration(baseline, delta)
		const twice = mergeIncomingExploration(once, delta)

		expect(requireTestValue(twice.playerStates.barbarians).exploration).toEqual(
			requireTestValue(once.playerStates.barbarians).exploration
		)
	})
})
