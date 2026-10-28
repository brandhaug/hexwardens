import { expect, test } from '@playwright/test'

test('shares confirmation across keyboard, desktop and mobile controls', async ({
	page
}) => {
	// Allow setup and confirmation before the existing bot-turn deadline.
	test.slow()
	await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
	)
	const endTurn = page.getByRole('button', { name: 'End Turn', exact: true })
	await expect(endTurn).toBeVisible({ timeout: 30_000 })
	const skip = page.getByRole('button', { name: 'Skip onboarding' })
	await skip.click()
	await expect(skip).toBeHidden()
	await expect(page).toHaveURL(/[?&]fresh=false(?:&|$)/)
	await expect(page.locator('canvas')).toBeVisible()
	await page.clock.pauseAt(new Date('2026-09-30T13:00:00Z'))
	await page.locator('body').click({ position: { x: 1, y: 1 } })
	await page.keyboard.press('Space')
	await expect(
		page.getByRole('button', { name: 'Confirm?', exact: true })
	).toBeVisible()
	await expect(
		page.getByLabel('Turn 1 of match.', { exact: true })
	).toBeVisible()
	await page.setViewportSize({ width: 390, height: 844 })
	await expect(
		page.getByRole('button', { name: 'Confirm?', exact: true })
	).toBeVisible()
	await page.getByRole('button', { name: 'Confirm?', exact: true }).click()
	await page.clock.resume()
	await expect(page.getByLabel('Turn 1 of match.', { exact: true })).toBeHidden(
		{ timeout: 15_000 }
	)
	await expect(endTurn).toBeVisible()
})

test('holding Space cannot confirm a turn', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
	)
	await expect(
		page.getByRole('button', { name: 'End Turn', exact: true })
	).toBeVisible({ timeout: 30_000 })
	const skip = page.getByRole('button', { name: 'Skip onboarding' })
	await skip.click()
	await expect(skip).toBeHidden()
	await expect(page).toHaveURL(/[?&]fresh=false(?:&|$)/)
	await expect(page.locator('canvas')).toBeVisible()
	await page.clock.pauseAt(new Date('2026-09-30T13:00:00Z'))
	await page.locator('body').click({ position: { x: 1, y: 1 } })
	await page.keyboard.down('Space')
	await expect(
		page.getByRole('button', { name: 'Confirm?', exact: true })
	).toBeVisible()
	await page.keyboard.down('Space')
	await page.keyboard.up('Space')
	await expect(
		page.getByLabel('Turn 1 of match.', { exact: true })
	).toBeVisible()
	await page.clock.fastForward(3000)
	await expect(
		page.getByRole('button', { name: 'End Turn', exact: true })
	).toBeVisible({ timeout: 5000 })
})

test('Space on a focused end-turn button arms once before committing', async ({
	page
}) => {
	// Allow setup and confirmation before the existing bot-turn deadline.
	test.slow()
	await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
	// Exercise keyboard confirmation without unrelated bot animation delays.
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner&botDelay=0'
	)
	const button = page.getByRole('button', { name: 'End Turn', exact: true })
	await expect(button).toBeVisible({ timeout: 30_000 })
	const skip = page.getByRole('button', { name: 'Skip onboarding' })
	await skip.click()
	await expect(skip).toBeHidden()
	await expect(page).toHaveURL(/[?&]fresh=false(?:&|$)/)
	await expect(page.locator('canvas')).toBeVisible()
	await page.clock.pauseAt(new Date('2026-09-30T13:00:00Z'))
	await button.focus()
	await page.keyboard.press('Space')
	await expect(
		page.getByRole('button', { name: 'Confirm?', exact: true })
	).toBeVisible()
	await expect(
		page.getByLabel('Turn 1 of match.', { exact: true })
	).toBeVisible()
	await page.keyboard.press('Space')
	await page.clock.resume()
	await expect(page.getByLabel('Turn 1 of match.', { exact: true })).toBeHidden(
		{ timeout: 15_000 }
	)
})
