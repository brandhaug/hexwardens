import { expect, test } from '@playwright/test'

// Failure cases: a high-density phone allocates a desktop-sized framebuffer,
// resizing leaves a stale budget, or reducing resolution makes the board vanish.
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })

test('keeps the board within its mobile pixel budget and restores desktop detail', async ({
	page
}, testInfo) => {
	test.slow()
	await page.goto(
		'/game?fresh=true&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
	)
	const canvas = page.locator('[data-game-canvas] canvas')
	await expect(canvas).toBeVisible({ timeout: 30_000 })
	await expect
		.poll(() =>
			canvas.evaluate((element) =>
				element instanceof HTMLCanvasElement
					? element.width / element.clientWidth
					: 0
			)
		)
		.toBeCloseTo(1.5, 1)
	await testInfo.attach('mobile-board', {
		body: await canvas.screenshot(),
		contentType: 'image/png'
	})
	await page.setViewportSize({ width: 1280, height: 800 })
	await expect
		.poll(() =>
			canvas.evaluate((element) =>
				element instanceof HTMLCanvasElement
					? element.width / element.clientWidth
					: 0
			)
		)
		.toBeCloseTo(2, 1)
	await testInfo.attach('desktop-board', {
		body: await canvas.screenshot(),
		contentType: 'image/png'
	})
})
