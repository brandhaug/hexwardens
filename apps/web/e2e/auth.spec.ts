import { expect, test, type Page } from '@playwright/test'

function uniqueUser() {
	const id = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
	return {
		username: `e2e_${id}`,
		email: `e2e_${id}@example.test`,
		password: 'correct-horse-battery'
	}
}

// The account screen is its own route. (The menu also links here via its Sign
// In button.) The Sign Up tab is a stable readiness signal once rendered.
async function openAuth(page: Page) {
	await page.goto('/sign-in')
	await expect(page.getByRole('tab', { name: 'Sign Up' })).toBeVisible({
		timeout: 10_000
	})
}

async function gotoSignUp(page: Page) {
	await openAuth(page)
	// The Tabs widget is JS-driven; clicking before hydration is a no-op.
	// Retry until the click actually swaps the panel.
	await expect(async () => {
		await page.getByRole('tab', { name: 'Sign Up' }).click({ timeout: 1000 })
		await expect(page.getByLabel('Email')).toBeVisible({ timeout: 1500 })
	}).toPass({ timeout: 15_000 })
}

async function gotoSignIn(page: Page) {
	await openAuth(page)
	// Sign In is the default tab, so the sign-up-only Email field is absent.
	await expect(page.getByLabel('Email')).toHaveCount(0)
}

// The Tabs widget keeps inactive panels mounted (Base UI uses inert+hidden,
// which Playwright's :visible filter doesn't always catch), so labels can
// match inputs from both forms. Each input has a unique id per panel; scope
// directly via id to avoid the ambiguity.
async function fillField(
	page: Page,
	formPrefix: 'sign-in' | 'sign-up',
	name: 'username' | 'email' | 'password',
	value: string
) {
	await page.locator(`#${formPrefix}-${name}`).fill(value)
}

async function submitSignUp(
	page: Page,
	user: { username: string; email: string; password: string }
) {
	await gotoSignUp(page)
	await fillField(page, 'sign-up', 'username', user.username)
	await fillField(page, 'sign-up', 'email', user.email)
	await fillField(page, 'sign-up', 'password', user.password)
	await page.getByRole('button', { name: /Sign Up|Creating account/ }).click()
}

async function submitSignIn(
	page: Page,
	user: { username: string; password: string }
) {
	await gotoSignIn(page)
	await fillField(page, 'sign-in', 'username', user.username)
	await fillField(page, 'sign-in', 'password', user.password)
	await page.getByRole('button', { name: /Sign In|Signing in/ }).click()
}

test.describe('auth: menu and form rendering', () => {
	test('menu is the initial page, playable without an account', async ({
		page
	}) => {
		await page.goto('/')
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: 'Multiplayer' })
		).toBeVisible()
		// Accounts are optional and reached via the menu's Sign In entry.
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
	})

	test('shows sign-in form by default when the account screen opens', async ({
		page
	}) => {
		await gotoSignIn(page)
		await expect(page.getByLabel('Username')).toBeVisible()
		await expect(page.getByLabel('Password')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
	})

	test('shows sign-up form when Sign Up tab is selected', async ({ page }) => {
		await gotoSignUp(page)
		await expect(page.locator('#sign-up-username')).toBeVisible()
		await expect(page.locator('#sign-up-email')).toBeVisible()
		await expect(page.locator('#sign-up-password')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible()
	})

	test('blocks submission with short password (native validation)', async ({
		page
	}) => {
		await gotoSignUp(page)
		await fillField(page, 'sign-up', 'username', 'shortpw')
		await fillField(page, 'sign-up', 'email', 'shortpw@example.test')
		await fillField(page, 'sign-up', 'password', 'short')
		await page.getByRole('button', { name: 'Sign Up' }).click()

		// Browser blocks submission via the input's `minLength`; URL must not
		// gain an authError param (which would mean the request reached the
		// server).
		await expect(page).toHaveURL(/^[^?]*\/?$/)
		await expect(page.getByLabel('Email')).toBeVisible()
	})
})

test.describe('auth: sign up', () => {
	test('creates an account and signs the user in', async ({ page }) => {
		const user = uniqueUser()
		await submitSignUp(page, user)

		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})
		await expect(page.getByRole('link', { name: user.username })).toBeVisible()
	})

	test('rejects duplicate username', async ({ page }) => {
		const user = uniqueUser()
		await submitSignUp(page, user)
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})

		await page.getByRole('button', { name: 'Sign Out' }).click()
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible({ timeout: 10_000 })

		await submitSignUp(page, { ...uniqueUser(), username: user.username })

		await expect(page.locator('.text-destructive').first()).toBeVisible({
			timeout: 10_000
		})
		await expect(page.getByRole('button', { name: 'Sign Out' })).toHaveCount(0)
	})
})

test.describe('auth: sign in', () => {
	test('signs in an existing user', async ({ page }) => {
		const user = uniqueUser()
		await submitSignUp(page, user)
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})
		await page.getByRole('button', { name: 'Sign Out' }).click()
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible({ timeout: 10_000 })

		await submitSignIn(page, user)

		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})
		await expect(page.getByRole('link', { name: user.username })).toBeVisible()
	})

	test('rejects wrong password', async ({ page }) => {
		const user = uniqueUser()
		await submitSignUp(page, user)
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})
		await page.getByRole('button', { name: 'Sign Out' }).click()
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible({ timeout: 10_000 })

		await submitSignIn(page, {
			username: user.username,
			password: 'wrong-password-123'
		})

		await expect(page.locator('.text-destructive').first()).toBeVisible({
			timeout: 10_000
		})
		await expect(page.getByRole('button', { name: 'Sign Out' })).toHaveCount(0)
	})

	test('rejects unknown username', async ({ page }) => {
		await submitSignIn(page, {
			username: `nonexistent_${crypto.randomUUID().slice(0, 6)}`,
			password: 'correct-horse-battery'
		})

		await expect(page.locator('.text-destructive').first()).toBeVisible({
			timeout: 10_000
		})
		await expect(page.getByRole('button', { name: 'Sign Out' })).toHaveCount(0)
	})
})

test.describe('auth: sign out', () => {
	test('returns to the menu and clears the session', async ({ page }) => {
		const user = uniqueUser()
		await submitSignUp(page, user)
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})

		await page.getByRole('button', { name: 'Sign Out' }).click()

		// Signing out drops back to the menu (the front door), showing the
		// optional Sign In entry again instead of the user's account controls.
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible({ timeout: 10_000 })
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Sign Out' })).toHaveCount(0)

		await page.reload()
		await expect(
			page.getByRole('button', { name: 'Single Player' })
		).toBeVisible({ timeout: 10_000 })
	})

	test('session persists across reloads until sign out', async ({ page }) => {
		const user = uniqueUser()
		await submitSignUp(page, user)
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})

		await page.reload()
		await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
			timeout: 15_000
		})
		await expect(page.getByRole('link', { name: user.username })).toBeVisible()
	})
})

test.describe('auth: request security', () => {
	test('serves auth pages privately with browser security headers', async ({
		request
	}) => {
		const response = await request.get('/sign-in')
		expect(response.headers()['cache-control']).toContain('no-store')
		expect(response.headers()['x-content-type-options']).toBe('nosniff')
		expect(response.headers()['x-frame-options']).toBe('DENY')
		expect(response.headers()['referrer-policy']).toBe(
			'strict-origin-when-cross-origin'
		)
	})

	test('rejects cross-site native form submission before authenticating', async ({
		page,
		request
	}) => {
		await gotoSignIn(page)
		const action = await page.locator('form').first().getAttribute('action')
		expect(action).toBeTruthy()
		const response = await request.post(
			new URL(action ?? '', page.url()).href,
			{
				headers: {
					origin: 'https://attacker.example',
					'sec-fetch-site': 'cross-site'
				},
				form: { username: 'attacker', password: 'password' },
				maxRedirects: 0
			}
		)
		expect(response.status()).toBe(403)
		expect(response.headers()['set-cookie']).toBeUndefined()
	})
})

test('auth: native form submissions share Better Auth credential throttling', async ({
	page,
	request
}) => {
	await gotoSignIn(page)
	const action = await page.locator('form').first().getAttribute('action')
	expect(action).toBeTruthy()
	const address = `192.0.2.${Math.floor(Math.random() * 200) + 20}`
	const url = new URL(action ?? '', page.url())
	for (let attempt = 0; attempt < 11; attempt++) {
		const response = await request.post(url.href, {
			headers: {
				origin: url.origin,
				'sec-fetch-site': 'same-origin',
				'cf-connecting-ip': address
			},
			form: {
				username: `missing_${crypto.randomUUID().slice(0, 8)}`,
				password: 'wrong-password'
			},
			maxRedirects: 0
		})
		expect(response.status()).toBe(303)
		const location = new URL(response.headers()['location'] ?? '', url)
		if (attempt === 10) {
			expect(location.searchParams.get('authError')).toBe(
				'Too many attempts. Please try again later.'
			)
		} else {
			expect(location.searchParams.get('authError')).toBe('Sign in failed')
		}
	}
})
