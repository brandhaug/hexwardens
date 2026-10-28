import { isConventionalTitle } from '../../scripts/check-commit-message.ts'
import { describe, expect, it } from 'vite-plus/test'

describe('Conventional Commit titles', () => {
	it.each([
		'feat: add multiplayer',
		'fix(combat): correct counter damage',
		'feat!: change the save format',
		'refactor(engine)!: normalize state',
		'chore(deps): update dependencies (#12)'
	])('accepts %s', (title) => {
		expect(isConventionalTitle(title)).toBe(true)
	})

	it.each([
		'Update README',
		'fix:',
		'fix: ',
		'unknown: something',
		'feat(): empty scope',
		'feat: two\nlines',
		'fix: trailing space '
	])('rejects %s', (title) => {
		expect(isConventionalTitle(title)).toBe(false)
	})
})
