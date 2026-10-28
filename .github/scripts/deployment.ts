import { appendFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import {
	deploymentOrigins,
	requiredEnv,
	validateStage
} from '../../infra/bindings.ts'
import { resolveDeploymentEnvironment } from '../../infra/deployment-env.ts'

const action = process.argv[2]
const stage = validateStage(requiredEnv('ALCHEMY_STAGE'))
if (action === 'urls') {
	const origins = await resolveDeploymentEnvironment(stage)
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
