import { expect, test } from '@playwright/test'

test('setup prevents incompatible player counts and map sizes', async ({
	page
}) => {
	await page.goto('/single-player-new')
	await expect(page.locator('body')).toHaveAttribute('data-hydrated', 'true')
	await page.getByRole('button', { name: 'small map', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'small map', exact: true })
	).toHaveAttribute('aria-pressed', 'true')
	await expect(
		page.getByRole('button', { name: '3 opponents', exact: true })
	).toBeDisabled()
	await expect(
		page.getByRole('button', { name: '2 opponents', exact: true })
	).toBeEnabled()
	await page.getByRole('button', { name: 'large map', exact: true }).click()
	await page.getByRole('button', { name: '4 opponents', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'small map', exact: true })
	).toBeDisabled()
	await expect(
		page.getByRole('button', { name: 'medium map', exact: true })
	).toBeDisabled()
	await page.getByRole('button', { name: '1 opponents', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'small map', exact: true })
	).toBeEnabled()
})

test('invalid direct game URLs explain the capacity limit', async ({
	page
}) => {
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=7&mapSize=small'
	)
	await expect(
		page.getByText('This setup does not fit.', { exact: false })
	).toBeVisible()
	await page.getByRole('button', { name: 'Change setup' }).click()
	await expect(page).toHaveURL(/single-player-new/)
})
