import * as Cloudflare from '@alchemy.run/cloudflare'
import * as GitHub from '@alchemy.run/github'
import * as Output from 'alchemy/Output'
import { Random } from 'alchemy/Random'
import { Effect, Redacted } from 'effect'
import { deploymentPolicy } from './bootstrap-config.ts'
import settings from '../deployment.config.ts'

export const configureDeployment = Effect.fn('bootstrap.configureDeployment')(
	function* (
		owner: string,
		repository: string,
		accountId: string,
		kind: 'production' | 'preview'
	) {
		const token = yield* Cloudflare.ApiToken.AccountApiToken(`${kind}-token`, {
			accountId,
			name: `${owner}/${repository} ${kind} deployment`,
			policies: deploymentPolicy(accountId)
		})
		const auth = yield* Random(`${kind}-auth-secret`, { bytes: 32 })
		const jwt = yield* Random(`${kind}-jwt-secret`, { bytes: 32 })
		const prefix = kind === 'preview' ? 'PREVIEW_' : ''
		const names =
			kind === 'preview' ? ['preview', 'preview-cleanup'] : ['production']
		const publications: Array<GitHub.Secret> = []
		for (const name of names) {
			const reviewers =
				name === 'preview-cleanup' ? [] : settings[kind].reviewers
			const environmentProps: GitHub.EnvironmentProps = {
				owner,
				repository,
				name,
				reviewers: { users: reviewers },
				preventSelfReview: reviewers.length > 0,
				waitTimer: 0
			}
			if (kind === 'production') {
				environmentProps.deploymentBranchPolicy = {
					customBranchPolicies: [settings.production.branch]
				}
			}
			const environment = yield* GitHub.Environment(name, environmentProps)
			for (const { key, value } of [
				{ key: 'CLOUDFLARE_API_TOKEN', value: token.value },
				{ key: 'CLOUDFLARE_ACCOUNT_ID', value: Redacted.make(accountId) },
				{ key: 'BETTER_AUTH_SECRET', value: auth.text },
				{ key: 'AUTH_JWT_SECRET', value: jwt.text }
			]) {
				publications.push(
					yield* GitHub.Secret(`${name}-${key}`, {
						owner,
						repository,
						environment: environment.name,
						name: `${prefix}${key}`,
						value
					})
				)
			}
		}
		return yield* GitHub.Variable(`${kind}-enabled`, {
			owner,
			repository,
			name: kind === 'production' ? 'DEPLOY_ENABLED' : 'PREVIEW_ENABLED',
			value: Output.map(
				Output.all(...publications.map((secret) => secret.updatedAt)),
				() => 'true'
			)
		})
	}
)
