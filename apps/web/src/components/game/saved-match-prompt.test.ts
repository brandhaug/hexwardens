import {
	savedMatchPromptTitle,
	savedMatchPromptSummary
} from './saved-match-prompt-copy'

const saved = {
	playerTribe: 'barbarians',
	mapSize: 'medium',
	opponentCount: 2,
	difficulty: 'Expert',
	turn: 9
} as const

describe('saved match prompt copy', () => {
	it('summarizes the saved match in player-facing language', () => {
		expect(savedMatchPromptTitle(saved)).toBe('Continue Barbarians Match')
		expect(savedMatchPromptSummary(saved)).toBe(
			'Turn 9 · medium board · 2 opponents · Expert'
		)
	})

	it('uses the singular opponent phrasing when there is one opponent', () => {
		expect(savedMatchPromptSummary({ ...saved, opponentCount: 1 })).toBe(
			'Turn 9 · medium board · 1 opponent · Expert'
		)
	})
})
