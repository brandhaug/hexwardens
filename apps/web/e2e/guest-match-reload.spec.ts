import { expect, test } from '@playwright/test'

test('guest players retain their match identity after refresh', async ({
	browser,
	baseURL
}) => {
	// Two clients each load the board twice using software rendering.
	test.slow()
	if (!baseURL) {
		throw new Error('Guest match tests require a configured baseURL')
	}
	const hostContext = await browser.newContext({ baseURL })
	const guestContext = await browser.newContext({ baseURL })
	try {
		const host = await hostContext.newPage()
		const guest = await guestContext.newPage()
		const lobbyCreates: string[] = []
		const lobbyJoins: string[] = []
		host.on('request', (request) => {
			if (
				request.method() === 'POST' &&
				request.url().endsWith('/lobby/create')
			) {
				lobbyCreates.push(request.url())
			}
		})
		guest.on('request', (request) => {
			if (
				request.method() === 'POST' &&
				request.url().endsWith('/lobby/join')
			) {
				lobbyJoins.push(request.url())
			}
		})
		await host.goto('/lobby?action=create')
		await expect(host.locator('body')).toHaveAttribute('data-hydrated', 'true')
		const invite = host.getByRole('button', { name: /Copy invite code / })
		await expect(invite).toBeVisible()
		const label = await invite.getAttribute('aria-label')
		const code = label?.match(/Copy invite code ([A-Z0-9]{6})/)?.[1]
		if (!code) {
			throw new Error('Missing invite code')
		}
		await guest.goto(`/lobby?action=join&inviteCode=${code}`)
		await expect(guest.locator('body')).toHaveAttribute('data-hydrated', 'true')
		await host.getByRole('button', { name: 'Choose barbarians' }).click()
		await expect(
			host.getByRole('button', { name: 'Choose barbarians', pressed: true })
		).toBeVisible()
		await guest.getByRole('button', { name: 'Choose rogues' }).click()
		await expect(
			guest.getByRole('button', { name: 'Choose rogues', pressed: true })
		).toBeVisible()
		await host.getByRole('button', { name: 'Unlimited', exact: true }).click()
		await expect(
			host.getByRole('button', {
				name: 'Unlimited',
				exact: true,
				pressed: true
			})
		).toBeVisible()
		await host.getByRole('button', { name: 'Ready up', exact: true }).click()
		await guest.getByRole('button', { name: 'Ready up', exact: true }).click()
		await host.getByRole('button', { name: 'Start match', exact: true }).click()
		for (const page of [host, guest]) {
			await expect(
				page.getByLabel('Turn 1 of match.', { exact: true })
			).toBeVisible({ timeout: 30_000 })
			await page.reload()
			await expect(
				page.getByLabel('Turn 1 of match.', { exact: true })
			).toBeVisible({ timeout: 15_000 })
		}
		expect(lobbyCreates).toHaveLength(1)
		expect(lobbyJoins).toHaveLength(1)
	} finally {
		await hostContext.close()
		await guestContext.close()
	}
})
