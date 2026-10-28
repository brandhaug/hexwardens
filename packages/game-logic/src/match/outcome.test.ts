import {
	requireTestValue,
	createTestBoard,
	createTestGameState,
	createTestVillage
} from '../test/game-test-helpers'
import { describe, expect, it } from 'vite-plus/test'
import { evaluateOutcome, MAX_TURNS, sealOutcome } from './outcome'

describe('evaluateOutcome', () => {
	it('returns ongoing when multiple tribes are alive', () => {
		const state = createTestGameState()
		expect(evaluateOutcome(state)).toEqual({ status: 'ongoing' })
	})

	it('returns ended with the surviving tribe when penultimate tribe is eliminated', () => {
		const state = createTestGameState({ eliminatedTribes: ['rogues'] })
		expect(evaluateOutcome(state)).toEqual({
			status: 'ended',
			winner: 'barbarians',
			reason: 'elimination'
		})
	})

	it('returns ended when one tribe owns villages and every opponent owns none', () => {
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: createTestVillage('barbarians')
		}
		const state = createTestGameState({ board })

		expect(evaluateOutcome(state)).toEqual({
			status: 'ended',
			winner: 'barbarians',
			reason: 'elimination'
		})
	})

	it('returns ended with winner null when every tribe is eliminated', () => {
		const state = createTestGameState({
			eliminatedTribes: ['barbarians', 'rogues']
		})
		expect(evaluateOutcome(state)).toEqual({
			status: 'ended',
			winner: null,
			reason: 'elimination'
		})
	})

	it('mirrors a pre-sealed state', () => {
		const state = createTestGameState({
			isGameOver: true,
			winner: 'rogues'
		})
		expect(evaluateOutcome(state)).toEqual({
			status: 'ended',
			winner: 'rogues',
			reason: 'elimination'
		})
	})

	it('ends with turnLimit when the turn cap is reached and declares a draw', () => {
		const state = createTestGameState({ turn: MAX_TURNS + 1 })
		expect(evaluateOutcome(state)).toEqual({
			status: 'ended',
			winner: null,
			reason: 'turnLimit'
		})
	})

	it('elimination beats turnLimit when both conditions hold on the same state', () => {
		const state = createTestGameState({
			turn: MAX_TURNS,
			eliminatedTribes: ['rogues']
		})
		expect(evaluateOutcome(state)).toEqual({
			status: 'ended',
			winner: 'barbarians',
			reason: 'elimination'
		})
	})
})

describe('sealOutcome', () => {
	it('is a no-op while the match is ongoing', () => {
		const state = createTestGameState()
		expect(sealOutcome(state)).toBe(state)
	})

	it('sets isGameOver and winner on the elimination transition', () => {
		const state = createTestGameState({ eliminatedTribes: ['rogues'] })
		const sealed = sealOutcome(state)
		expect(sealed.isGameOver).toBe(true)
		expect(sealed.winner).toBe('barbarians')
	})

	it('records tribes with no remaining villages as eliminated', () => {
		const board = createTestBoard(2)
		requireTestValue(board[2])[2] = {
			...requireTestValue(requireTestValue(board[2])[2]),
			item: createTestVillage('barbarians')
		}
		const sealed = sealOutcome(createTestGameState({ board }))

		expect(sealed.eliminatedTribes).toContain('rogues')
		expect(sealed.isGameOver).toBe(true)
		expect(sealed.winner).toBe('barbarians')
	})

	it('produces winner null when multiple tribes fall in a single transition', () => {
		const state = createTestGameState({
			eliminatedTribes: ['barbarians', 'rogues']
		})
		const sealed = sealOutcome(state)
		expect(sealed.isGameOver).toBe(true)
		expect(sealed.winner).toBeNull()
	})

	it('is idempotent on an already-sealed state', () => {
		const state = createTestGameState({ eliminatedTribes: ['rogues'] })
		const once = sealOutcome(state)
		const twice = sealOutcome(once)
		expect(twice).toBe(once)
		expect(twice.isGameOver).toBe(true)
		expect(twice.winner).toBe('barbarians')
	})

	it('seals as a draw (winner null) when the turn cap is reached', () => {
		const state = createTestGameState({ turn: MAX_TURNS + 1 })
		const sealed = sealOutcome(state)
		expect(sealed.isGameOver).toBe(true)
		expect(sealed.winner).toBeNull()
	})
})
