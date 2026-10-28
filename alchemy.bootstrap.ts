import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as GitHub from 'alchemy/GitHub'
import { RandomProvider } from 'alchemy/Random'
import { localState } from 'alchemy/State/LocalState'
import { Effect, Layer } from 'effect'
import { bootstrapConfig } from './infra/bootstrap-config.ts'
import { configureDeployment } from './infra/github-deployment.ts'

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
