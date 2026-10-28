import { expect, test } from '@playwright/test'
import { createFixtureMatch, installSavedMatch } from './saved-match-fixture'

// Failure cases: a saved draw never mounts the result, reads as defeat, or
// acknowledgement forgets to tombstone the finished match.
test('resumes a finished draw and acknowledges its saved result', async ({
	page
}) => {
	const initial = createFixtureMatch('draw-fixture')
	await installSavedMatch(page, {
		...initial,
		turnSchedule: null,
		gameState: {
			...initial.gameState,
			turn: 501,
			isGameOver: true,
			winner: null
		}
	})

	await page.goto('/game')
	await expect(
		page.getByRole('dialog', { name: 'Draw', exact: true })
	).toBeVisible({ timeout: 30_000 })
	await expect(
		page.getByText('The match ended without a winner.')
	).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Defeat' })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Play Again' })).toBeFocused()
	await page.getByRole('button', { name: 'Play Again' }).click()
	await expect(page).toHaveURL(/\/$/)
	await page.goto('/single-player')
	await expect(page).toHaveURL(/single-player-new/)
	await expect(
		page.getByRole('button', { name: 'Continue saved match' })
	).toHaveCount(0)
})
