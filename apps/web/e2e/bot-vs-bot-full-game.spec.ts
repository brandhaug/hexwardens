import { expect, test } from '@playwright/test'

const TARGET_TURN = 10

// Known-benign console noise — dev-server 404s, favicons, vite HMR chatter.
// Filter these so the test fails only on errors originating from app code.
const IGNORED_CONSOLE_PATTERNS = [
	/favicon/i,
	/manifest\.webmanifest/i,
	/404 \(Not Found\)/,
	/Failed to load resource/i,
	/\[vite\]/i
]

function isIgnoredConsoleError(text: string): boolean {
	return IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))
}

test.describe('bot-vs-bot full game (spectator)', () => {
	test('offline /game route survives many bot turns without errors', async ({
		page
	}) => {
		// Ten turns include cold assets and software rendering on CI.
		test.setTimeout(180_000)
		const pageErrors: string[] = []
		const consoleErrors: string[] = []
		// oxlint-disable-next-line hexwardens/no-unknown-error-message -- The E2E diagnostic collector retains actual browser errors to identify regressions.
		page.on('pageerror', (err) => pageErrors.push(err.message))
		page.on('console', (msg) => {
			if (msg.type() !== 'error') {
				return
			}
			const text = msg.text()
			if (isIgnoredConsoleError(text)) {
				return
			}
			consoleErrors.push(text)
		})

		// Keep the paced browser path while minimizing its per-action delay.
		// Board generation defaults to Date.now(). Fix that seed so a random
		// early victory cannot end the match before the turn assertion.
		// setFixedTime leaves the real bot and rendering timers running.
		await page.clock.setFixedTime(42)
		// This checks engine progress, so keep software rendering within CI's budget.
		await page.setViewportSize({ width: 640, height: 480 })
		await page.goto(
			'/game?fresh=true&spectator=true&botDelay=1&tribe=barbarians&numberOfOpponents=1&mapSize=small&difficulty=Beginner'
		)

		// Turn counter lives in the top bar: "Turn {n}". Wait until enough bot
		// turns have elapsed to exercise the full engine loop (resource tick,
		// village levelup, research, training, combat, fog mutation).
		await expect(async () => {
			const text = await page
				.getByText(/^Turn \d+$/)
				.first()
				.textContent()
			const match = text?.match(/Turn (\d+)/)
			const turn = match ? Number(match[1]) : 0
			expect(turn).toBeGreaterThanOrEqual(TARGET_TURN)
		}).toPass({ timeout: 120_000 })

		expect(pageErrors).toEqual([])
		expect(consoleErrors).toEqual([])
	})
})
