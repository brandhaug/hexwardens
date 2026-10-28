import { ConfigProvider, Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import {
	bootstrapConfig,
	deploymentPolicy
} from '../../infra/bootstrap-config.ts'

describe('deployment bootstrap boundaries', () => {
	const accountId = 'a'.repeat(32)
	const inputs = {
		CLOUDFLARE_ACCOUNT_ID: accountId,
		BOOTSTRAP_GITHUB_REPOSITORY: 'owner/hexwardens'
	}

	it('limits the deployment token to the selected account and required APIs', () => {
		expect(deploymentPolicy(accountId)).toEqual([
			{
				effect: 'allow',
				permissionGroups: [
					'Workers Scripts Write',
					'D1 Write',
					'Secrets Store Write'
				],
				resources: { [`com.cloudflare.api.account.${accountId}`]: '*' }
			}
		])
	})

	it('requires an explicit repository and leaves previews disabled by default', () => {
		const configured = Effect.runSync(
			bootstrapConfig.pipe(
				Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(inputs)))
			)
		)
		expect(configured).toEqual({
			accountId,
			owner: 'owner',
			repository: 'hexwardens',
			previewAccountId: ''
		})
	})

	it.each([
		{ ...inputs, CLOUDFLARE_ACCOUNT_ID: '' },
		{ ...inputs, BOOTSTRAP_GITHUB_REPOSITORY: '../another/repo' },
		{ ...inputs, BOOTSTRAP_PREVIEW_ACCOUNT_ID: accountId },
		{ ...inputs, BOOTSTRAP_PREVIEW_ACCOUNT_ID: 'bad-account' }
	])('rejects malformed targets and production-account previews', (env) => {
		expect(() =>
			Effect.runSync(
				bootstrapConfig.pipe(
					Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)))
				)
			)
		).toThrow(/SchemaError/)
	})
})
