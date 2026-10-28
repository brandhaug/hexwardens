import {
	appendChronicleEntries,
	emptyChronicle,
	truncateChronicle
} from './chronicle'
import { type ChronicleEntry } from './chronicle-entry'

const turnEntry: ChronicleEntry = {
	kind: 'turnAdvanced',
	actorTribe: 'barbarians',
	turn: 1
}

describe('appendChronicleEntries', () => {
	it('returns the same chronicle when no entries are appended', () => {
		const next = appendChronicleEntries(emptyChronicle, [])
		expect(next).toBe(emptyChronicle)
	})

	it('assigns monotonically-increasing seq ids', () => {
		const next = appendChronicleEntries(emptyChronicle, [
			turnEntry,
			turnEntry,
			turnEntry
		])
		expect(next.entries.map((e) => e.seq)).toEqual([1, 2, 3])
		expect(next.nextSeq).toBe(4)
	})

	it('preserves seq across multiple appends', () => {
		const a = appendChronicleEntries(emptyChronicle, [turnEntry])
		const b = appendChronicleEntries(a, [turnEntry])
		expect(b.entries.map((e) => e.seq)).toEqual([1, 2])
		expect(b.nextSeq).toBe(3)
	})

	it('does not mutate the input chronicle', () => {
		const before = appendChronicleEntries(emptyChronicle, [turnEntry])
		const beforeEntries = before.entries
		appendChronicleEntries(before, [turnEntry])
		expect(before.entries).toBe(beforeEntries)
		expect(before.entries).toHaveLength(1)
	})
})

describe('truncateChronicle', () => {
	it('returns the same chronicle when within limits', () => {
		const c = appendChronicleEntries(emptyChronicle, [turnEntry, turnEntry])
		const next = truncateChronicle(c, 5)
		expect(next).toBe(c)
	})

	it('drops the oldest entries when over limit', () => {
		const c = appendChronicleEntries(emptyChronicle, [
			turnEntry,
			turnEntry,
			turnEntry,
			turnEntry
		])
		const next = truncateChronicle(c, 2)
		expect(next.entries.map((e) => e.seq)).toEqual([3, 4])
		expect(next.nextSeq).toBe(5)
	})
})
