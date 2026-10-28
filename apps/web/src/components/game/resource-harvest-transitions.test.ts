import { createTile } from '@hexwardens/game-logic/tile/tile'
import { type Resource } from '@hexwardens/game-logic/domains/resource'
import {
	isHarvestDestination,
	resourceHarvests
} from './resource-harvest-transitions'

const item: Resource = { type: 'resource', value: 'apple' }
const empty = createTile({ q: 0, r: 0 })
const resource = { ...empty, item }

describe('resource harvest transitions', () => {
	it('keeps the old resource and its board position for a visible collection', () => {
		expect(resourceHarvests([[null, resource]], [[null, empty]])).toEqual([
			{ item, position: { q_idx: 1, r_idx: 0 }, terrain: 'grass' }
		])
	})

	it('does not animate a resource that disappears into fog or outside the board', () => {
		expect(
			resourceHarvests([[resource]], [[{ terrain: null, item: null }]])
		).toEqual([])
		expect(resourceHarvests([[resource]], [[null]])).toEqual([])
		expect(resourceHarvests([[resource]], [])).toEqual([])
	})

	it('does not replay collections on reveals, unchanged snapshots, or replacements', () => {
		expect(resourceHarvests([[null]], [[resource]])).toEqual([])
		expect(resourceHarvests([[resource]], [[resource]])).toEqual([])
		expect(
			resourceHarvests(
				[[resource]],
				[[{ ...empty, item: { type: 'resource', value: 'iron' } }]]
			)
		).toEqual([])
	})

	it('hides an in-flight collection after rollback or fog replaces the empty tile', () => {
		expect(isHarvestDestination(empty)).toBe(true)
		expect(isHarvestDestination(resource)).toBe(false)
		expect(isHarvestDestination({ terrain: null, item: null })).toBe(false)
	})
})
