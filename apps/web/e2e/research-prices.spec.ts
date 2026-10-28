import { expect, test } from '@playwright/test'
import { createFixtureMatch, installSavedMatch } from './saved-match-fixture'

// Failure cases: the panel silently uses a one-village price, a player with
// seven gold can attempt an eight-gold purchase, or the displayed eight-gold
// purchase deducts a different amount than the authoritative planner.
// oxlint-disable-next-line vitest/prefer-each -- Playwright uses parameterized test registration, not Vitest test.each.
for (const money of [7, 8]) {
	test(`two villages price tier-two research at eight gold with ${money} available`, async ({
		page
	}) => {
		test.slow()
		const initial = createFixtureMatch(`research-price-${money}`)
		const neutral = initial.gameState.units.board
			.flat()
			.find(
				(tile) => tile?.item?.type === 'village' && tile.item.tribe === null
			)
		const player = initial.gameState.playerStates.barbarians
		if (neutral?.item?.type !== 'village' || !player) {
			throw new Error('Expected player and neutral village in research fixture')
		}
		const ownedVillage = { ...neutral.item, tribe: player.tribe }
		const board = initial.gameState.units.board.map((row) =>
			row.map((tile) =>
				tile === neutral ? { ...tile, item: ownedVillage } : tile
			)
		)
		await installSavedMatch(page, {
			...initial,
			gameState: {
				...initial.gameState,
				units: { ...initial.gameState.units, board },
				playerStates: {
					...initial.gameState.playerStates,
					barbarians: {
						...player,
						money,
						researchedTechs: ['fruit_harvesting']
					}
				}
			}
		})
		await expect(page.locator('body')).toHaveAttribute('data-hydrated', 'true')
		await page.getByRole('button', { name: /Single Player/ }).click()
		await page.getByRole('button', { name: 'Continue saved match' }).click()
		await page.getByRole('button', { name: 'Skip onboarding' }).click()
		await page.getByText('Keyboard board', { exact: true }).press('Enter')
		const tiles = page.getByRole('combobox', { name: 'Board tile' })
		const capital = await tiles
			.getByRole('option')
			.filter({ hasText: 'barbarians capital' })
			.first()
			.getAttribute('value')
		if (!capital) {
			throw new Error('Expected owned capital')
		}
		await tiles.selectOption(capital)
		await page
			.getByRole('button', { name: 'Select tile', exact: true })
			.press('Enter')
		await page
			.getByRole('button', { name: 'Research', exact: true })
			.press('Enter')
		// The lazy panel and React Flow layout must be ready before pricing assertions.
		await expect(page.getByRole('dialog', { name: 'Tech Tree' })).toBeVisible({
			timeout: 15_000
		})
		const farming = page.locator('[data-id="farming"]')
		await expect(farming).toBeVisible({ timeout: 15_000 })
		await expect(farming.getByTitle('Gold cost')).toHaveText('8')
		if (money === 7) {
			await expect(
				farming.getByRole('button', { name: 'Need 8 gold', exact: true })
			).toBeDisabled()
		} else {
			const research = farming.getByRole('button', {
				name: 'Research (8 gold)',
				exact: true
			})
			await expect(research).toBeEnabled()
			await research.press('Enter')
			await expect(
				farming.getByTitle('Researched', { exact: true })
			).toBeVisible()
			await expect(page.locator('header[data-game-chrome]')).toContainText(
				/Gold:\s*0/
			)
		}
	})
}
