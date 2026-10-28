import { expect, test } from '@playwright/test'

const freshMatch =
	'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'

// Failure cases: count includes passed units, no touch cycling, old preferences
// disable confirmation, setting disappears after reload, replay is blocked after
// completion, or setup advertises a hero as an opening unit.
test('shows opening troops and keeps next-unit count in step with passing', async ({
	page
}) => {
	await page.goto('/single-player-new')
	await page.getByRole('button', { name: 'Choose barbarians' }).click()
	await expect(page.getByLabel('Starting forces')).toContainText('2 Caveman')
	await expect(page.getByLabel('Starting forces')).toContainText('5 gold')
	await page.goto(freshMatch)
	await page.getByRole('button', { name: 'Skip onboarding' }).click()
	const next = page.getByRole('button', { name: 'Next unit, 2 needing orders' })
	await expect(next).toBeVisible()
	await next.click()
	await page.locator('body').click({ position: { x: 1, y: 1 } })
	await page.keyboard.press('p')
	await expect(
		page.getByRole('button', { name: 'Next unit, 1 needing orders' })
	).toBeVisible()
	await page.setViewportSize({ width: 390, height: 844 })
	await page
		.getByRole('button', { name: 'Next unit, 1 needing orders' })
		.click()
})

test('persists optional turn confirmation and can replay completed guidance', async ({
	page
}) => {
	// Two WebGL page loads, a bot turn and tutorial replay share this budget.
	test.slow()
	await page.goto(freshMatch)
	await page.getByRole('button', { name: 'Skip onboarding' }).click()
	await page.getByRole('button', { name: 'Open menu', exact: true }).click()
	const confirmation = page.getByRole('button', { name: /Confirm end turn/ })
	await expect(confirmation).toHaveAttribute('aria-pressed', 'true')
	await confirmation.click()
	await expect(confirmation).toHaveAttribute('aria-pressed', 'false')
	await page.keyboard.press('Escape')
	await page.getByRole('button', { name: 'End Turn', exact: true }).click()
	await expect(page.getByLabel('Turn 1 of match.', { exact: true })).toBeHidden(
		{ timeout: 15_000 }
	)
	await page.getByRole('button', { name: 'Open menu', exact: true }).click()
	await page
		.getByRole('button', { name: 'Replay tutorial', exact: true })
		.click()
	await expect(
		page.getByRole('heading', { name: 'Welcome to Hexwardens' })
	).toBeVisible()
	await page.reload()
	await expect(
		page.getByRole('heading', { name: 'Welcome to Hexwardens' })
	).toBeVisible()
	await page.getByRole('button', { name: 'Open menu', exact: true }).click()
	await expect(confirmation).toHaveAttribute('aria-pressed', 'false')
})

test('remembers completed lessons after deselection and reload, then learns an actual move', async ({
	page
}) => {
	await page.goto(freshMatch)
	await expect(
		page.getByRole('heading', { name: 'Welcome to Hexwardens' })
	).toBeVisible()
	await page.getByText('Keyboard board', { exact: true }).click()
	const tiles = page.getByRole('combobox', { name: 'Board tile' })
	const capital = await tiles
		.getByRole('option')
		.filter({ hasText: 'barbarians capital' })
		.first()
		.getAttribute('value')
	if (!capital) {
		throw new Error('Expected own capital')
	}
	await tiles.selectOption(capital)
	await page.getByRole('button', { name: 'Select tile', exact: true }).click()
	await expect(
		page.getByRole('heading', { name: 'Move a Unit', exact: true })
	).toBeVisible()
	await tiles.press('Escape')
	await expect(
		page.getByRole('heading', { name: 'Move a Unit', exact: true })
	).toBeVisible()
	await page.reload()
	await expect(
		page.getByRole('heading', { name: 'Move a Unit', exact: true })
	).toBeVisible()
	await page.getByText('Keyboard board', { exact: true }).click()
	const source = await tiles
		.getByRole('option')
		.filter({ hasText: 'barbarians Caveman' })
		.first()
		.getAttribute('value')
	if (!source) {
		throw new Error('Expected own unit')
	}
	await tiles.selectOption(source)
	await page.getByRole('button', { name: 'Select tile', exact: true }).click()
	const destination = await tiles
		.getByRole('option')
		.filter({ hasText: 'reachable' })
		.first()
		.getAttribute('value')
	if (!destination) {
		throw new Error('Expected reachable destination')
	}
	await tiles.selectOption(destination)
	await page
		.getByRole('button', { name: 'Move here', exact: true })
		.press('Enter')
	await expect(
		page.getByRole('heading', { name: 'End your Turn', exact: true })
	).toBeVisible()
})
