import { Result } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { createCodec } from './codec'

const codec = createCodec()

describe('MatchCodec.decode', () => {
	it('rejects non-JSON', () => {
		const r = codec.decode('not json')
		expect(Result.isFailure(r)).toBe(true)
		assert(Result.isFailure(r))
		expect(r.failure.message).toMatch(/Invalid JSON/)
	})

	it('rejects non-object payloads', () => {
		const r = codec.decode(JSON.stringify('string'))
		expect(Result.isFailure(r)).toBe(true)
	})

	it('rejects missing type', () => {
		const r = codec.decode(JSON.stringify({}))
		expect(Result.isFailure(r)).toBe(true)
		assert(Result.isFailure(r))
		expect(r.failure.message).toMatch(/type/)
	})

	it('rejects unknown type', () => {
		const r = codec.decode(JSON.stringify({ type: 'nuke' }))
		expect(Result.isFailure(r)).toBe(true)
	})

	it('accepts endTurn', () => {
		const r = codec.decode(JSON.stringify({ type: 'endTurn' }))
		expect(Result.isSuccess(r)).toBe(true)
		assert(Result.isSuccess(r))
		expect(r.success).toEqual({ type: 'endTurn' })
	})

	it('decodes actionRequest with a valid tile action', () => {
		const r = codec.decode(
			JSON.stringify({
				type: 'actionRequest',
				action: { kind: 'collect', at: { q: 1, r: -1, s: 0 } }
			})
		)
		expect(Result.isSuccess(r)).toBe(true)
		assert(Result.isSuccess(r))
		expect(r.success).toEqual({
			type: 'actionRequest',
			action: { kind: 'collect', at: { q: 1, r: -1, s: 0 } }
		})
	})

	it('rejects actionRequest when at has wrong shape (q_idx/r_idx)', () => {
		const r = codec.decode(
			JSON.stringify({
				type: 'actionRequest',
				action: { kind: 'collect', at: { q_idx: 1, r_idx: 0 } }
			})
		)
		expect(Result.isFailure(r)).toBe(true)
		assert(Result.isFailure(r))
		expect(r.failure.message).toMatch(/at/)
	})

	it('rejects actionRequest with missing action', () => {
		const r = codec.decode(
			JSON.stringify({
				type: 'actionRequest',
				at: { q: 0, r: 0, s: 0 }
			})
		)
		expect(Result.isFailure(r)).toBe(true)
	})

	it('rejects actionRequest without a target', () => {
		const r = codec.decode(
			JSON.stringify({ type: 'actionRequest', action: { kind: 'collect' } })
		)
		expect(Result.isFailure(r)).toBe(true)
	})

	it('decodes action with a move payload', () => {
		const payload = {
			type: 'move',
			from: { q: 0, r: 0, s: 0 },
			to: { q: 1, r: 0, s: -1 }
		}
		const r = codec.decode(JSON.stringify({ type: 'action', action: payload }))
		expect(Result.isSuccess(r)).toBe(true)
		assert(Result.isSuccess(r) && r.success.type === 'action')
		expect(r.success.action).toEqual(payload)
	})

	it('rejects action with non-object action field', () => {
		const r = codec.decode(JSON.stringify({ type: 'action', action: 'bad' }))
		expect(Result.isFailure(r)).toBe(true)
	})

	it('rejects setSlotBot when slotIndex is not an integer', () => {
		const r = codec.decode(
			JSON.stringify({ type: 'setSlotBot', slotIndex: 1.5, isBot: true })
		)
		expect(Result.isFailure(r)).toBe(true)
	})
})
