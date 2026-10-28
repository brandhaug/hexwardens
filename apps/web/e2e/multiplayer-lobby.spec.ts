import {
	expect,
	test as base,
	type Browser,
	type BrowserContext,
	type Page
} from '@playwright/test'

const PASSWORD = 'correct-horse-battery'

type TestUser = {
	username: string
	email: string
	password: string
}

type UserSession = {
	context: BrowserContext
	page: Page
	user: TestUser
}

type MultiplayerFixtures = {
	createSignedInUser: (label: string) => Promise<UserSession>
}

function uniqueUser(label: string): TestUser {
	const id = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
	const shortLabel = label.slice(0, 5)
	return {
		username: `e2e_${shortLabel}_${id}`,
		email: `e2e_${shortLabel}_${id}@example.test`,
		password: PASSWORD
	}
}

async function signUp(page: Page, user: TestUser) {
	// The account screen is its own route; open it and switch to the Sign Up
	// tab (JS-driven, so retry until hydration makes the click register).
	await page.goto('/sign-in')
	await expect(page.getByRole('tab', { name: 'Sign Up' })).toBeVisible({
		timeout: 10_000
	})
	await expect(async () => {
		await page.getByRole('tab', { name: 'Sign Up' }).click({ timeout: 1000 })
		await expect(page.locator('#sign-up-email')).toBeVisible({
			timeout: 1500
		})
	}).toPass({ timeout: 15_000 })
	await page.locator('#sign-up-username').fill(user.username)
	await page.locator('#sign-up-email').fill(user.email)
	await page.locator('#sign-up-password').fill(user.password)
	await page.getByRole('button', { name: /Sign Up|Creating account/ }).click()
	await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
		timeout: 15_000
	})
}

async function newSignedInUser(
	browser: Browser,
	baseURL: string | undefined,
	label: string
): Promise<UserSession> {
	if (baseURL === undefined) {
		throw new Error('Playwright baseURL must be configured')
	}
	// Each local browser represents a distinct Cloudflare client identity.
	const identity = crypto.randomUUID().replaceAll('-', '')
	const context = await browser.newContext({
		baseURL,
		ignoreHTTPSErrors: true,
		extraHTTPHeaders: {
			'cf-connecting-ip': `2001:db8:${identity.slice(0, 4)}:${identity.slice(4, 8)}::1`
		}
	})
	const page = await context.newPage()
	const user = uniqueUser(label)
	await signUp(page, user)
	// The edge header belongs only to the local auth setup, not cross-origin game requests.
	await context.setExtraHTTPHeaders({})
	return { context, page, user }
}

const test = base.extend<MultiplayerFixtures>({
	createSignedInUser: async ({ browser, baseURL }, runFixture) => {
		const sessions: UserSession[] = []
		await runFixture(async (label) => {
			const session = await newSignedInUser(browser, baseURL, label)
			sessions.push(session)
			return session
		})
		for (const session of sessions) {
			await session.context.close()
		}
	}
})

async function expectLobby(
	page: Page,
	name: 'Gather the table' | 'Public queue'
) {
	await expect(page.getByText(name, { exact: true })).toBeVisible({
		timeout: 15_000
	})
}

async function chooseTribe(page: Page, tribe: string) {
	await page.getByRole('button', { name: `Choose ${tribe}` }).click()
	await expect(
		page.getByRole('button', { name: `Choose ${tribe}`, pressed: true })
	).toBeVisible()
}

async function readyUp(page: Page) {
	await page.getByRole('button', { name: 'Ready' }).click()
	await expect(page.getByRole('button', { name: 'Unready' })).toBeVisible()
}

async function expectMultiplayerGameRoute(page: Page) {
	await expect(page).toHaveURL(/\/multiplayer-game\?matchId=/, {
		timeout: 30_000
	})
	await expect(
		page
			.getByText(/^Turn \d+$/)
			.or(page.getByText('Joining match'))
			.first()
	).toBeVisible({ timeout: 15_000 })
}

async function readInviteCode(page: Page): Promise<string> {
	const copyInvite = page.getByRole('button', { name: /Copy invite code / })
	await expect(copyInvite).toBeVisible({ timeout: 15_000 })
	const label = await copyInvite.getAttribute('aria-label')
	const match = label?.match(/Copy invite code ([A-Z0-9]{6})/)
	if (match?.[1] === undefined) {
		throw new Error(`Could not parse invite code from aria-label: ${label}`)
	}
	return match[1]
}

async function joinWithManualCode(page: Page, inviteCode: string) {
	const inviteInput = page.getByPlaceholder('ABCD12')
	const joinButton = page.getByRole('button', { name: 'Join', exact: true })
	await expect(inviteInput).toBeVisible()
	// React 19 selective hydration: fill() on an unhydrated input fires the
	// native event but never reaches React's synthetic onChange, so the
	// controlled state never updates and the button stays disabled. Wait for
	// the root's hydration marker before filling.
	await expect(page.locator('body[data-hydrated="true"]')).toBeAttached({
		timeout: 15_000
	})
	await inviteInput.fill(inviteCode)
	await expect(joinButton).toBeEnabled({ timeout: 5000 })
	await joinButton.click()
}

test.describe('multiplayer lobby start flows', () => {
	// Two sign-ups and both game clients must fit in the test's overall budget.
	test.slow()
	test('starts a private match after a second player joins by invite code', async ({
		createSignedInUser
	}) => {
		const host = await createSignedInUser('private_host')
		const guest = await createSignedInUser('private_guest')

		await host.page.goto('/lobby?action=create')
		await expectLobby(host.page, 'Gather the table')
		const inviteCode = await readInviteCode(host.page)

		await guest.page.goto(
			`/lobby?action=join&inviteCode=${encodeURIComponent(inviteCode)}`
		)
		await expectLobby(guest.page, 'Gather the table')

		await chooseTribe(host.page, 'barbarians')
		await chooseTribe(guest.page, 'rogues')
		await readyUp(host.page)
		await readyUp(guest.page)
		await expect(
			host.page.getByRole('button', { name: 'Start match' })
		).toBeEnabled()

		await host.page.getByRole('button', { name: 'Start match' }).click()

		await expectMultiplayerGameRoute(host.page)
		await expectMultiplayerGameRoute(guest.page)
	})

	test('starts a private match after a second player joins with the manual invite form', async ({
		createSignedInUser
	}) => {
		const host = await createSignedInUser('manual_host')
		const guest = await createSignedInUser('manual_guest')

		await host.page.goto('/lobby?action=create')
		await expectLobby(host.page, 'Gather the table')
		const inviteCode = await readInviteCode(host.page)

		await guest.page.goto('/lobby')
		await joinWithManualCode(guest.page, inviteCode)
		await expectLobby(guest.page, 'Gather the table')

		await chooseTribe(host.page, 'druids')
		await chooseTribe(guest.page, 'orcs')
		await readyUp(host.page)
		await readyUp(guest.page)
		await host.page.getByRole('button', { name: 'Start match' }).click()

		await expectMultiplayerGameRoute(host.page)
		await expectMultiplayerGameRoute(guest.page)
	})

	test('starts a two-player match through the public queue', async ({
		createSignedInUser
	}) => {
		const first = await createSignedInUser('queue_first')
		const second = await createSignedInUser('queue_second')

		await first.page.goto('/lobby?action=queue')
		await expectLobby(first.page, 'Public queue')

		await second.page.goto('/lobby?action=queue')

		await expectMultiplayerGameRoute(first.page)
		await expectMultiplayerGameRoute(second.page)
	})
})
