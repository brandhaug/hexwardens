import * as Alchemy from 'alchemy'
import * as Cloudflare from '@alchemy.run/cloudflare'
import * as GitHub from '@alchemy.run/github'
import { RandomProvider } from 'alchemy/Random'
import { localState } from 'alchemy/State/LocalState'
import { Effect, Layer } from 'effect'
import { bootstrapConfig } from './infra/bootstrap-config.ts'
import { configureDeployment } from './infra/github-deployment.ts'
import settings from './deployment.config.ts'

export default Alchemy.Stack(
	'hexwardens-deployment-access',
	{
		providers: Layer.mergeAll(
			Cloudflare.providers(),
			GitHub.providers(),
			RandomProvider()
		),
		// Contains write-only token values. Keep this operator-owned state private.
		state: localState()
	},
	Effect.gen(function* () {
		const { owner, repository, accountId, previewAccountId } =
			yield* bootstrapConfig
		yield* GitHub.BranchProtection('default-branch', {
			owner,
			repository,
			branch: settings.production.branch,
			enforceAdmins: true,
			requiredLinearHistory: true,
			allowForcePushes: false,
			allowDeletions: false,
			requiredConversationResolution: true,
			requiredPullRequestReviews: { requiredApprovingReviewCount: 0 },
			requiredStatusChecks: {
				strict: true,
				checks: ['CI gate', 'audit', 'Conventional commit title'].map(
					(context) => ({ context, appId: 15_368 })
				)
			}
		}).pipe(Alchemy.RemovalPolicy.retain())
		yield* configureDeployment(owner, repository, accountId, 'production')
		if (previewAccountId) {
			yield* configureDeployment(owner, repository, previewAccountId, 'preview')
		} else {
			yield* GitHub.Variable('preview-enabled', {
				owner,
				repository,
				name: 'PREVIEW_ENABLED',
				value: 'false'
			})
		}
		return { accountId, repository: `${owner}/${repository}` }
	})
)
