import { expect, test } from '@playwright/test'

test('refreshing a new match preserves its committed turn', async ({
	page
}) => {
	// Includes two WebGL page loads and the asynchronous bot turn.
	test.slow()
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner&botDelay=0'
	)
	const skip = page.getByRole('button', { name: 'Skip onboarding' })
	await skip.click()
	await expect(skip).toBeHidden()
	await expect(page).toHaveURL(/[?&]fresh=false(?:&|$)/)
	// Keyboard activation avoids spending the confirmation window on pointer stability.
	await page
		.getByRole('button', { name: 'End Turn', exact: true })
		.press('Enter')
	await page
		.getByRole('button', { name: 'Confirm?', exact: true })
		.press('Enter')
	await expect(
		page.getByLabel('Turn 2 of match.', { exact: true })
	).toBeVisible({ timeout: 15_000 })
	await page.reload()
	await expect(
		page.getByLabel('Turn 2 of match.', { exact: true })
	).toBeVisible({ timeout: 15_000 })
	await expect(
		page.getByRole('button', { name: 'End Turn', exact: true })
	).toBeVisible()
})

test('a failed local turn commit stays playable and can be retried', async ({
	page
}) => {
	test.slow()
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner&botDelay=0'
	)
	await page.getByRole('button', { name: 'Skip onboarding' }).click()
	await expect(
		page.getByLabel('Turn 1 of match.', { exact: true })
	).toBeVisible()
	await page.evaluate(() => {
		// The injected method preserves its receiver through put.call below.
		// oxlint-disable-next-line typescript/unbound-method
		const put = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value, key) {
			IDBObjectStore.prototype.put = put
			const request = put.call(this, value, key)
			this.transaction.abort()
			return request
		}
	})
	await page
		.getByRole('button', { name: 'End Turn', exact: true })
		.press('Enter')
	await page
		.getByRole('button', { name: 'Confirm?', exact: true })
		.press('Enter')
	await expect(
		page.getByText('The turn could not be saved. Try ending your turn again.')
	).toBeVisible()
	await expect(
		page.getByLabel('Turn 1 of match.', { exact: true })
	).toBeVisible()
	await page
		.getByRole('button', { name: 'End Turn', exact: true })
		.press('Enter')
	await page
		.getByRole('button', { name: 'Confirm?', exact: true })
		.press('Enter')
	await expect(
		page.getByLabel('Turn 2 of match.', { exact: true })
	).toBeVisible({ timeout: 15_000 })
	await page.reload()
	await expect(
		page.getByLabel('Turn 2 of match.', { exact: true })
	).toBeVisible({ timeout: 15_000 })
	await test.info().attach('durable-turn-after-retry-and-reload', {
		body: await page.screenshot(),
		contentType: 'image/png'
	})
})
