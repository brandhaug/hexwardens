import { expect, test } from '@playwright/test'

// Failure cases: canvas-only commands, hidden tile details exposed, keyboard
// movement bypassing shared input, or focus trapped in the board.
test('inspect and move a unit through the semantic board controls', async ({
	page
}, testInfo) => {
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
	)
	await expect(
		page.getByRole('button', { name: 'End Turn', exact: true })
	).toBeVisible({ timeout: 30_000 })
	const skip = page.getByRole('button', { name: 'Skip onboarding' })
	if (await skip.isVisible()) {
		await skip.click()
	}
	await page.getByText('Keyboard board', { exact: true }).click()
	const tiles = page.getByRole('combobox', { name: 'Board tile' })
	const ownUnit = tiles
		.getByRole('option')
		.filter({ hasText: 'barbarians Caveman' })
		.first()
	const source = await ownUnit.getAttribute('value')
	expect(source).not.toBeNull()
	await tiles.selectOption(source ?? '')
	await page.getByRole('button', { name: 'Select tile', exact: true }).click()
	const destination = await tiles
		.getByRole('option')
		.filter({ hasText: 'reachable' })
		.first()
		.getAttribute('value')
	expect(destination).not.toBeNull()
	await tiles.selectOption(destination ?? '')
	await page
		.getByRole('button', { name: 'Move here', exact: true })
		.press('Enter')
	await expect(tiles.locator('option:checked')).toContainText(
		'barbarians Caveman'
	)
	await tiles.press('Escape')
	await expect(
		page.getByRole('button', { name: 'Move here', exact: true })
	).toHaveCount(0)
	await page.screenshot({ path: testInfo.outputPath('keyboard-board.png') })
	await testInfo.attach('keyboard-board', {
		path: testInfo.outputPath('keyboard-board.png'),
		contentType: 'image/png'
	})
})

test('unavailable commands remain inspectable', async ({ page }) => {
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
	)
	await expect(
		page.getByRole('button', { name: 'End Turn', exact: true })
	).toBeVisible({ timeout: 30_000 })
	const skip = page.getByRole('button', { name: 'Skip onboarding' })
	if (await skip.isVisible()) {
		await skip.click()
	}
	await page.getByText('Keyboard board', { exact: true }).click()
	const tiles = page.getByRole('combobox', { name: 'Board tile' })
	const source = await tiles
		.getByRole('option')
		.filter({ hasText: 'barbarians Caveman' })
		.first()
		.getAttribute('value')
	await tiles.selectOption(source ?? '')
	await page.getByRole('button', { name: 'Select tile', exact: true }).click()
	await page.getByText('Keyboard board', { exact: true }).click()
	await page.getByText('Inspect actions', { exact: true }).click()
	const actions = page.getByRole('region', { name: 'Action details' })
	await expect(
		actions.getByRole('button', { name: 'Recover', exact: true })
	).toBeDisabled()
	await expect(
		actions
			.getByRole('group', { name: 'Recover', exact: true })
			.getByText(/already at full health/)
	).toBeVisible()
})
