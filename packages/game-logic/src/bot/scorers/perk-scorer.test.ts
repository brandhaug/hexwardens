import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestUnit,
	createTestUnitState,
	createTestVillage,
	setUnitAt
} from '../../test/game-test-helpers'
import { type BoardPosition } from '../../board/board'
import { tribeToTribeStats } from '../../domains/tribe'
import { scorePerkActions } from './perk-scorer'
import { fixtureOf } from './scorer-test-helpers'

const at: BoardPosition = { q_idx: 2, r_idx: 2 }

function stateWithPending(opts: {
	options: ReadonlyArray<
		| 'expand_sight'
		| 'increase_population'
		| 'extra_money'
		| 'expand_range'
		| 'special_unit'
		| 'extra_experience'
	>
	level: 2 | 5
	heroAlive?: boolean
}) {
	const board = createTestBoard(2)
	requireTestValue(board[at.r_idx])[at.q_idx] = {
		...requireTestValue(requireTestValue(board[at.r_idx])[at.q_idx]),
		item: createTestVillage('barbarians', { level: opts.level })
	}
	let unitStates = {}
	if (opts.heroAlive) {
		const heroPos: BoardPosition = { q_idx: 1, r_idx: 1 }
		const hero = createTestUnit(
			'barbarians',
			tribeToTribeStats.barbarians.heroUnit
		)
		setUnitAt(board, heroPos, hero)
		unitStates = {
			[hero.id]: createTestUnitState(
				heroPos,
				tribeToTribeStats.barbarians.heroUnit
			)
		}
	}
	return createTestGameState({
		board,
		unitStates,
		pendingPerkChoices: {
			barbarians: [
				{
					villagePosition: at,
					level: opts.level,
					options: [...opts.options]
				}
			]
		}
	})
}

describe('scorePerkActions', () => {
	it('emits one candidate per offered Perk when no Hero is alive', () => {
		const state = stateWithPending({
			options: ['special_unit', 'extra_money', 'increase_population'],
			level: 5
		})
		const fixture = fixtureOf(state, 'barbarians')
		const actions = scorePerkActions(fixture)
		expect(actions).toHaveLength(3)
	})

	it('declines `special_unit` when the Tribe Hero is already on the board', () => {
		const state = stateWithPending({
			options: ['special_unit', 'extra_money', 'increase_population'],
			level: 5,
			heroAlive: true
		})
		const fixture = fixtureOf(state, 'barbarians')
		const actions = scorePerkActions(fixture)
		const types = actions.map((a) => {
			const action = a.execute()
			return action.kind === 'tileAction' && action.action.kind === 'selectPerk'
				? action.action.perk
				: action.kind
		})
		expect(types).not.toContain('special_unit')
		// Other perks still surface.
		expect(types).toContain('extra_money')
	})

	it('ranks `special_unit` highest among options when no Hero exists', () => {
		const state = stateWithPending({
			options: ['special_unit', 'extra_money', 'increase_population'],
			level: 5
		})
		const fixture = fixtureOf(state, 'barbarians')
		const actions = scorePerkActions(fixture)
		const sorted = [...actions].toSorted((a, b) => b.score - a.score)
		const top = sorted[0]?.execute()
		expect(top?.kind).toBe('tileAction')
		assert(top?.kind === 'tileAction')
		expect(top.action).toMatchObject({
			kind: 'selectPerk',
			perk: 'special_unit'
		})
	})

	it('returns no candidates when the queue is empty', () => {
		const state = createTestGameState({})
		const fixture = fixtureOf(state, 'barbarians')
		expect(scorePerkActions(fixture)).toEqual([])
	})
})
