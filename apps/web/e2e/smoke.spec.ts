import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

test.describe('smoke: landing', () => {
	test('renders title and the game-mode menu', async ({ page }) => {
		await page.goto('/')
		await expect(
			page.getByRole('heading', { name: 'Hexwardens' })
		).toBeVisible()
		// The menu is the front door — no auth gate. Game-mode choices are
		// visible immediately, with an optional Sign In entry for accounts.
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: 'Multiplayer' })
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: 'Leaderboard' })
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
	})

	test('single player setup is its own route', async ({ page }) => {
		await page.goto('/')
		const singlePlayer = page.getByRole('button', { name: 'Single Player' })
		await expect(singlePlayer).toBeVisible()
		// Retry the click until hydration wires the navigation handler.
		await expect(async () => {
			await singlePlayer.click({ timeout: 1000 })
			await expect(page).toHaveURL(/\/single-player/, { timeout: 1500 })
		}).toPass({ timeout: 15_000 })
		// A fresh context has no saved match, so the gate route forwards to the
		// dedicated config-form route.
		await expect(page).toHaveURL(/\/single-player-new/, { timeout: 15_000 })
		await expect(
			page.getByRole('button', { name: 'Start match' })
		).toBeVisible()
	})

	test('account screen is its own route', async ({ page }) => {
		await page.goto('/sign-in')
		await expect(page.getByRole('tab', { name: 'Sign In' })).toBeVisible()
		await expect(page.getByRole('tab', { name: 'Sign Up' })).toBeVisible()
	})
})

test.describe('smoke: offline game', () => {
	test('loads hex game with End Turn control', async ({ page }) => {
		await page.goto(
			'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
		)
		await expect(
			page.getByRole('button', { name: /End Turn|Confirm\?/ })
		).toBeVisible({ timeout: 15_000 })
	})

	test('keyboard shortcuts focus their close control and dismiss with Escape', async ({
		page
	}) => {
		// CI initializes and renders the board with software WebGL.
		test.slow()
		await page.goto(
			'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
		)
		await expect(
			page.getByRole('button', { name: /End Turn|Confirm\?/ })
		).toBeVisible({ timeout: 15_000 })
		const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
		// Controls can mount before the keyboard effect, then suspend for assets.
		await expect(async () => {
			await page.keyboard.press('Shift+/')
			await expect(dialog).toBeVisible({ timeout: 1500 })
		}).toPass({ timeout: 30_000 })
		await expect(
			dialog.getByRole('button', { name: 'Close keyboard shortcuts' })
		).toBeFocused()
		await page.keyboard.press('Escape')
		await expect(dialog).toBeHidden()
	})

	test('renders a nonblank 3D board canvas', async ({ page }) => {
		// Software WebGL and cold model decoding share the small CI runner.
		test.slow()
		// Keep the pixel probe small enough for SwiftShader to finish compositing.
		await page.setViewportSize({ width: 640, height: 480 })
		await page.goto(
			'/game?fresh=true&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
		)
		await expect(
			page.getByRole('button', { name: /End Turn|Confirm\?/ })
		).toBeVisible({ timeout: 15_000 })

		const canvas = page.locator('canvas').first()
		await expect(canvas).toBeVisible()
		await expect(async () => {
			// Read the composited screenshot. WebGL's default framebuffer is cleared
			// after presentation, so readPixels between frames can report a blank board.
			const screenshot = await canvas.screenshot()
			const hasBoardPixels = await page.evaluate(async (base64) => {
				const image = new Image()
				image.src = `data:image/png;base64,${base64}`
				await image.decode()
				const surface = document.createElement('canvas')
				surface.width = image.width
				surface.height = image.height
				const context = surface.getContext('2d')
				if (!context) {
					return false
				}
				context.drawImage(image, 0, 0)
				const sampleFractions = [0.18, 0.3, 0.42, 0.5, 0.58, 0.7, 0.82]
				// The empty sky varies vertically, but is uniform within each row.
				// Require horizontal color variation so a transparent canvas cannot pass.
				for (const yFraction of sampleFractions) {
					const baseline = context.getImageData(
						Math.floor(image.width * 0.18),
						Math.floor(image.height * yFraction),
						1,
						1
					).data
					for (const xFraction of sampleFractions) {
						const pixel = context.getImageData(
							Math.floor(image.width * xFraction),
							Math.floor(image.height * yFraction),
							1,
							1
						).data
						const red = pixel[0] ?? 0
						const green = pixel[1] ?? 0
						const blue = pixel[2] ?? 0
						const alpha = pixel[3] ?? 0
						const contrast =
							Math.abs(red - (baseline[0] ?? 0)) +
							Math.abs(green - (baseline[1] ?? 0)) +
							Math.abs(blue - (baseline[2] ?? 0))
						if (alpha > 0 && contrast > 60) {
							return true
						}
					}
				}
				return false
			}, Buffer.from(screenshot).toString('base64'))
			expect(hasBoardPixels).toBe(true)
		}).toPass({ timeout: 60_000 })
	})
})

test.describe('smoke: leaderboard', () => {
	test('renders header, filters, and empty or populated body', async ({
		page
	}) => {
		await page.goto('/leaderboard')
		await expect(
			page
				.locator('[data-slot="card-title"]')
				.filter({ hasText: 'Leaderboard' })
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Wins' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Win rate' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Matches' })).toBeVisible()

		const table = page.getByRole('table')
		const emptyState = page.getByText(/No ranked matches yet/i)
		await expect(table.or(emptyState).first()).toBeVisible()
	})

	test('home shows leaderboard link that navigates', async ({ page }) => {
		await page.goto('/')
		const leaderboardButton = page.getByRole('button', { name: 'Leaderboard' })
		await expect(leaderboardButton).toBeVisible()
		// Retry the click until hydration wires the navigation handler.
		await expect(async () => {
			await leaderboardButton.click({ timeout: 1000 })
			await expect(page).toHaveURL(/\/leaderboard/, { timeout: 1500 })
		}).toPass({ timeout: 15_000 })
		await expect(
			page
				.locator('[data-slot="card-title"]')
				.filter({ hasText: 'Leaderboard' })
		).toBeVisible()
	})
})

test.describe('smoke: wiki', () => {
	test('wiki index shows categories and article links', async ({ page }) => {
		await page.goto('/wiki')
		await expect(
			page.getByRole('heading', { name: 'Hexwardens Wiki' })
		).toBeVisible()
		await expect(
			page.getByRole('heading', { name: 'Getting Started' }).first()
		).toBeVisible()
	})

	test('article route renders MDX content', async ({ page }) => {
		await page.goto('/wiki/getting-started/overview')
		await expect(
			page.locator('main').getByRole('heading').first()
		).toBeVisible()
	})
})
