import { Schema } from 'effect'
import { deploymentOrigins, requiredEnv, validateStage } from './bindings.ts'

const subdomainResponse = Schema.Struct({
	success: Schema.Literal(true),
	result: Schema.Struct({
		subdomain: Schema.String.check(
			Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
		)
	})
})
const decodeSubdomain = Schema.decodeUnknownSync(subdomainResponse)

/** Resolve the same origins for Alchemy, the client bundle, and smoke checks. */
export async function resolveDeploymentEnvironment(stage: string) {
	validateStage(stage)
	const needsDiscovery =
		!process.env.CLOUDFLARE_WORKERS_SUBDOMAIN &&
		(stage !== 'prod' ||
			!process.env.BETTER_AUTH_URL ||
			!process.env.GAME_SERVER_URL)
	if (needsDiscovery) {
		const account = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
		if (!/^[a-f0-9]{32}$/.test(account)) {
			throw new Error('Invalid Cloudflare account ID')
		}
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,
			{
				headers: {
					Authorization: `Bearer ${requiredEnv('CLOUDFLARE_API_TOKEN')}`
				},
				signal: AbortSignal.timeout(15_000)
			}
		)
		if (!response.ok) {
			throw new Error(`Subdomain lookup failed: HTTP ${response.status}`)
		}
		const body = decodeSubdomain(await response.json())
		process.env.CLOUDFLARE_WORKERS_SUBDOMAIN = body.result.subdomain
	}
	return deploymentOrigins(stage)
}
