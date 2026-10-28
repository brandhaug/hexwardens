import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	setUnitAt
} from '../../test/game-test-helpers'
import { type CombatEvent } from '../../combat/types'
import { type Tribe } from '../../domains/tribe'
import { type Unit, unitToUnitStats } from '../../domains/unit'

import { type BroadcastEvent } from '../../turns/events'
import {
	entriesFromBroadcastEvents,
	entriesFromCombatEvents
} from './entries-from-events'

describe('entriesFromBroadcastEvents', () => {
	const turn = 4

	it('drops salary events as noise', () => {
		const events: BroadcastEvent[] = [
			{ type: 'salary', tribe: 'barbarians', amount: 5 }
		]
		expect(entriesFromBroadcastEvents(events, turn)).toEqual([])
	})

	it('emits researchCompleted only when completed', () => {
		const events: BroadcastEvent[] = [
			{
				type: 'research',
				tribe: 'barbarians',
				tech: 'archer',
				completed: false,
				turnsRemaining: 2
			},
			{ type: 'research', tribe: 'rogues', tech: 'farming', completed: true }
		]
		const out = entriesFromBroadcastEvents(events, turn)
		expect(out).toEqual([
			{
				kind: 'researchCompleted',
				actorTribe: 'rogues',
				tech: 'farming',
				turn
			}
		])
	})

	it('emits researchProgress when explicitly opted in', () => {
		const events: BroadcastEvent[] = [
			{
				type: 'research',
				tribe: 'barbarians',
				tech: 'archer',
				completed: false,
				turnsRemaining: 2
			}
		]
		const out = entriesFromBroadcastEvents(events, turn, {
			includeResearchProgress: true
		})
		expect(out).toEqual([
			{
				kind: 'researchProgress',
				actorTribe: 'barbarians',
				tech: 'archer',
				turnsRemaining: 2,
				turn
			}
		])
	})

	it('maps villageLevel and villageCaptured directly', () => {
		const events: BroadcastEvent[] = [
			{ type: 'villageLevel', tribe: 'barbarians', levelUps: 2 },
			{
				type: 'villageCaptured',
				byTribe: 'barbarians',
				fromTribe: 'rogues',
				at: { q_idx: 1, r_idx: 2 }
			}
		]
		expect(entriesFromBroadcastEvents(events, turn)).toEqual([
			{ kind: 'villageLevelUp', actorTribe: 'barbarians', levelUps: 2, turn },
			{
				kind: 'villageCaptured',
				actorTribe: 'barbarians',
				targetTribe: 'rogues',
				position: { q_idx: 1, r_idx: 2 },
				turn
			}
		])
	})

	it('maps turnRotated to turnAdvanced for the incoming tribe', () => {
		const events: BroadcastEvent[] = [
			{ type: 'turnRotated', from: 'barbarians', to: 'rogues', turn: 5 }
		]
		expect(entriesFromBroadcastEvents(events, turn)).toEqual([
			{ kind: 'turnAdvanced', actorTribe: 'rogues', turn: 5 }
		])
	})

	it('maps gameOver including draw (winner null)', () => {
		const events: BroadcastEvent[] = [{ type: 'gameOver', winner: null }]
		expect(entriesFromBroadcastEvents(events, turn)).toEqual([
			{ kind: 'gameOver', actorTribe: null, turn }
		])
	})
})

describe('entriesFromCombatEvents', () => {
	function buildStateWithUnits() {
		const board = createTestBoard(2)
		const attacker: Unit = createTestUnit('barbarians', 'caveman')
		const defender: Unit = createTestUnit('rogues', 'caveman')
		setUnitAt(board, { q_idx: 1, r_idx: 1 }, attacker)
		setUnitAt(board, { q_idx: 2, r_idx: 1 }, defender)
		const state = createTestGameState({
			board,
			unitStates: {
				[attacker.id]: createTestUnitState({ q_idx: 1, r_idx: 1 }, 'caveman'),
				[defender.id]: createTestUnitState({ q_idx: 2, r_idx: 1 }, 'caveman')
			}
		})
		return { state, attackerId: attacker.id, defenderId: defender.id }
	}

	it('emits unitDefeated entries with the victim tribe and position', () => {
		const { state, attackerId, defenderId } = buildStateWithUnits()
		const events: CombatEvent[] = [
			{ type: 'attack', attackerId, defenderId, damage: 5 },
			{ type: 'kill', killerId: attackerId, victimId: defenderId }
		]
		const out = entriesFromCombatEvents(events, state, 'barbarians', 7)
		expect(out).toEqual([
			{
				kind: 'unitDefeated',
				actorTribe: 'barbarians',
				targetTribe: 'rogues',
				position: { q_idx: 2, r_idx: 1 },
				turn: 7
			}
		])
	})

	it('credits counter-kills to the killer tribe, not the original attacker', () => {
		const { state, attackerId, defenderId } = buildStateWithUnits()
		const events: CombatEvent[] = [
			// Defender survives, counters, and kills the original attacker.
			{ type: 'attack', attackerId, defenderId, damage: 1 },
			{
				type: 'counter',
				attackerId: defenderId,
				defenderId: attackerId,
				damage: 99
			},
			{ type: 'kill', killerId: defenderId, victimId: attackerId }
		]
		const attackerTribe: Tribe = 'barbarians'
		const out = entriesFromCombatEvents(events, state, attackerTribe, 3)
		expect(out).toHaveLength(1)
		const entry = requireTestValue(out[0])
		expect(entry.kind).toBe('unitDefeated')
		assert(entry.kind === 'unitDefeated')
		expect(entry.actorTribe).toBe('rogues') // killer tribe (counter)
		expect(entry.targetTribe).toBe('barbarians') // original attacker
	})

	it('skips non-kill events', () => {
		const { state, attackerId, defenderId } = buildStateWithUnits()
		const events: CombatEvent[] = [
			{ type: 'attack', attackerId, defenderId, damage: 5 },
			{ type: 'dodge', unitId: defenderId, context: 'attack' }
		]
		expect(entriesFromCombatEvents(events, state, 'barbarians', 1)).toEqual([])
	})

	it('uses unitToUnitStats lookup pattern (sanity check helpers)', () => {
		// Confirms the helper imports compile: unit stats are fully resolved.
		expect(unitToUnitStats.caveman.health).toBeGreaterThan(0)
	})
})
