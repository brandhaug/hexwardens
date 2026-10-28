import { type Policy } from '@alchemy.run/cloudflare/ApiToken'
import { Config, Effect, Schema } from 'effect'

const accountPattern = /^[a-f0-9]{32}$/
const distinctAccounts = Schema.Struct({
	accountId: Schema.String,
	previewAccountId: Schema.String
}).check(
	Schema.makeFilter(
		({ accountId, previewAccountId }) =>
			accountId !== previewAccountId ||
			'Preview deployments require a separate Cloudflare account'
	)
)

export function deploymentPolicy(accountId: string): Array<Policy> {
	return [
		{
			effect: 'allow',
			permissionGroups: [
				'Workers Scripts Write',
				'D1 Write',
				'Secrets Store Write'
			],
			resources: { [`com.cloudflare.api.account.${accountId}`]: '*' }
		}
	]
}

export const bootstrapConfig = Effect.gen(function* () {
	const inputs = yield* Config.all({
		accountId: Config.schema(
			Schema.String.check(Schema.isPattern(accountPattern)),
			'CLOUDFLARE_ACCOUNT_ID'
		),
		githubRepository: Config.schema(
			Schema.String.check(
				Schema.isPattern(
					/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/
				)
			),
			'BOOTSTRAP_GITHUB_REPOSITORY'
		),
		previewAccountId: Config.schema(
			Schema.String.check(Schema.isPattern(/^$|^[a-f0-9]{32}$/)),
			'BOOTSTRAP_PREVIEW_ACCOUNT_ID'
		).pipe(Config.withDefault(''))
	})
	yield* Schema.decodeEffect(distinctAccounts)(inputs).pipe(
		Effect.mapError((error) => new Config.ConfigError(error))
	)
	const separator = inputs.githubRepository.indexOf('/')
	return {
		accountId: inputs.accountId,
		owner: inputs.githubRepository.slice(0, separator),
		repository: inputs.githubRepository.slice(separator + 1),
		previewAccountId: inputs.previewAccountId
	}
})
