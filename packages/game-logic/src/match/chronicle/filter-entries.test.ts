import { positionKey } from '../../board/position'
import { type ChronicleEntry } from './chronicle-entry'
import { filterEntriesForViewer } from './filter-entries'

describe('filterEntriesForViewer', () => {
	const visiblePos = { q_idx: 1, r_idx: 1 }
	const hiddenPos = { q_idx: 9, r_idx: 9 }
	const visible = new Set<string>([positionKey(visiblePos)])

	it('always shows turnAdvanced and gameOver to all viewers', () => {
		const entries: ChronicleEntry[] = [
			{ kind: 'turnAdvanced', actorTribe: 'rogues', turn: 4 },
			{ kind: 'gameOver', actorTribe: 'rogues', turn: 5 }
		]
		expect(filterEntriesForViewer(entries, 'barbarians', visible)).toEqual(
			entries
		)
	})

	it('hides opponent research, level-ups, and progress events', () => {
		const entries: ChronicleEntry[] = [
			{
				kind: 'researchCompleted',
				actorTribe: 'rogues',
				tech: 'archer',
				turn: 1
			},
			{
				kind: 'researchProgress',
				actorTribe: 'rogues',
				tech: 'archer',
				turnsRemaining: 1,
				turn: 1
			},
			{ kind: 'villageLevelUp', actorTribe: 'rogues', levelUps: 1, turn: 1 }
		]
		expect(filterEntriesForViewer(entries, 'barbarians', visible)).toEqual([])
	})

	it('shows the viewer their own research and level-ups', () => {
		const entries: ChronicleEntry[] = [
			{
				kind: 'researchCompleted',
				actorTribe: 'barbarians',
				tech: 'archer',
				turn: 1
			},
			{ kind: 'villageLevelUp', actorTribe: 'barbarians', levelUps: 2, turn: 1 }
		]
		expect(filterEntriesForViewer(entries, 'barbarians', visible)).toEqual(
			entries
		)
	})

	it('shows positional events when their tile is visible', () => {
		const entries: ChronicleEntry[] = [
			{
				kind: 'unitDefeated',
				actorTribe: 'rogues',
				targetTribe: 'orcs',
				position: visiblePos,
				turn: 1
			}
		]
		expect(filterEntriesForViewer(entries, 'barbarians', visible)).toEqual(
			entries
		)
	})

	it('hides positional events when both the actor/target are foreign and the tile is hidden', () => {
		const entries: ChronicleEntry[] = [
			{
				kind: 'unitDefeated',
				actorTribe: 'rogues',
				targetTribe: 'orcs',
				position: hiddenPos,
				turn: 1
			},
			{
				kind: 'villageCaptured',
				actorTribe: 'rogues',
				targetTribe: 'orcs',
				position: hiddenPos,
				turn: 1
			}
		]
		expect(filterEntriesForViewer(entries, 'barbarians', visible)).toEqual([])
	})

	it('always shows positional events that involve the viewer, regardless of fog', () => {
		const entries: ChronicleEntry[] = [
			{
				kind: 'villageCaptured',
				actorTribe: 'rogues',
				targetTribe: 'barbarians',
				position: hiddenPos,
				turn: 1
			},
			{
				kind: 'unitDefeated',
				actorTribe: 'barbarians',
				targetTribe: 'rogues',
				position: hiddenPos,
				turn: 1
			}
		]
		expect(filterEntriesForViewer(entries, 'barbarians', visible)).toEqual(
			entries
		)
	})
})
