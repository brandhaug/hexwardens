import { Schema } from 'effect'
import { appendFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import {
	deploymentOrigins,
	requiredEnv,
	validateStage
} from '../../infra/bindings.ts'

const action = process.argv[2]
const stage = validateStage(requiredEnv('ALCHEMY_STAGE'))
if (action === 'urls') {
	if (stage !== 'prod') {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${requiredEnv('CLOUDFLARE_ACCOUNT_ID')}/workers/subdomain`,
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
		const body = Schema.decodeUnknownSync(
			Schema.Struct({
				result: Schema.Struct({ subdomain: Schema.String })
			})
		)(await response.json())
		process.env.CLOUDFLARE_WORKERS_SUBDOMAIN = body.result.subdomain
	}
	const origins = deploymentOrigins(stage)
	appendFileSync(
		requiredEnv('GITHUB_ENV'),
		`CLOUDFLARE_WORKERS_SUBDOMAIN=${process.env.CLOUDFLARE_WORKERS_SUBDOMAIN ?? ''}\nBETTER_AUTH_URL=${origins.web}\nGAME_SERVER_URL=${origins.gameServer}\n`
	)
	appendFileSync(
		requiredEnv('GITHUB_STEP_SUMMARY'),
		`Stage ${stage}\n\nWeb: ${origins.web}\n\nGame server: ${origins.gameServer}\n`
	)
} else if (action === 'smoke') {
	const origins = deploymentOrigins(stage)
	for (const url of [`${origins.gameServer}/health`, `${origins.web}/`]) {
		let success = false
		for (let attempt = 0; attempt < 6; attempt += 1) {
			const response = await fetch(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(10_000)
			}).catch(() => undefined)
			await response?.body?.cancel()
			if (response?.status === 200) {
				success = true
				break
			}
			if (attempt < 5) {
				await setTimeout(3000)
			}
		}
		if (!success) {
			throw new Error(`Deployment smoke failed: ${url}`)
		}
	}
} else {
	throw new Error('Expected urls or smoke')
}
