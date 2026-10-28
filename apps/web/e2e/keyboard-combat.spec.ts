import { expect, test } from '@playwright/test'
import { Board, positionKey } from '@hexwardens/game-logic/board/board'
import { occupiedTiles, unitsLow } from '@hexwardens/game-logic/units/registry'
import { createFixtureMatch, installSavedMatch } from './saved-match-fixture'

// Failure cases: keyboard activation selects instead of attacking, a successful
// attack does not update the semantic board, or fog labels disclose enemy units.
test('attacks through keyboard controls while unexplored tiles keep their contents hidden', async ({
	page
}, testInfo) => {
	const initial = createFixtureMatch('keyboard-combat-fixture')
	const ownUnit = occupiedTiles(initial.gameState.units, 'barbarians')[0]
	const enemyUnits = occupiedTiles(initial.gameState.units, 'rogues')
	const enemy = enemyUnits.find((entry) => entry.unit.type === 'caveman')
	const hiddenEnemy = enemyUnits.find(
		(entry) => entry.unit.id !== enemy?.unit.id
	)
	if (!ownUnit || !enemy || !hiddenEnemy) {
		throw new Error('Expected opening troops for the combat fixture')
	}
	const board = Board.from(initial.gameState.units.board)
	const adjacent = board.neighborsOf(ownUnit.position).find((position) => {
		const tile = board.at(position)
		return (
			tile &&
			!tile.unit &&
			!tile.isMountain &&
			!tile.obstacle &&
			tile.terrain !== 'water' &&
			tile.terrain !== 'ocean'
		)
	})
	if (!adjacent) {
		throw new Error('Expected empty neighboring tile')
	}
	const moved = unitsLow.move(initial.gameState.units, enemy.unit.id, adjacent)
	const units = unitsLow.setHealth(moved, enemy.unit.id, 1)
	await installSavedMatch(page, {
		...initial,
		gameState: { ...initial.gameState, units }
	})
	await page.goto('/game')
	await page.getByRole('button', { name: 'Skip onboarding' }).click()
	await page.getByText('Keyboard board', { exact: true }).press('Enter')
	const tiles = page.getByRole('combobox', { name: 'Board tile' })
	const fogged = tiles.getByRole('option').filter({ hasText: 'unexplored' })
	expect(await fogged.count()).toBeGreaterThan(0)
	for (const label of await fogged.allTextContents()) {
		expect(label).toMatch(/^Tile \d+, \d+: unexplored$/)
	}
	const hiddenOption = tiles.locator(
		`option[value="${positionKey(hiddenEnemy.position)}"]`
	)
	await expect(hiddenOption).toHaveText(
		`Tile ${hiddenEnemy.position.q_idx}, ${hiddenEnemy.position.r_idx}: unexplored`
	)
	await tiles.selectOption(positionKey(ownUnit.position))
	await page
		.getByRole('button', { name: 'Select tile', exact: true })
		.press('Enter')
	await tiles.selectOption(positionKey(adjacent))
	await expect(tiles.locator('option:checked')).toContainText('rogues Caveman')
	await expect(tiles.locator('option:checked')).toContainText('attackable')
	await page
		.getByRole('button', { name: 'Attack here', exact: true })
		.press('Enter')
	await expect(tiles.locator('option:checked')).not.toContainText(
		'rogues Caveman'
	)
	await expect(tiles.locator('option:checked')).toContainText(
		'barbarians Caveman'
	)
	await expect(hiddenOption).toHaveText(
		`Tile ${hiddenEnemy.position.q_idx}, ${hiddenEnemy.position.r_idx}: unexplored`
	)
	await page.screenshot({ path: testInfo.outputPath('keyboard-combat.png') })
	await testInfo.attach('keyboard-combat', {
		path: testInfo.outputPath('keyboard-combat.png'),
		contentType: 'image/png'
	})
})
