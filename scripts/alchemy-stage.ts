import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
	deploymentOrigins,
	requiredEnv,
	validateStage
} from '../infra/bindings.ts'

export function stageCommand(
	action: string,
	stage: string,
	account: string,
	confirmation: string | undefined
): string[] {
	validateStage(stage)
	if (action !== 'deploy' && action !== 'destroy') {
		throw new Error('Action must be deploy or destroy')
	}
	if (!account || confirmation !== `${account}/${stage}`) {
		throw new Error('An exact --confirm-target=<account>/<stage> is required')
	}
	if (action === 'destroy' && stage === 'prod') {
		throw new Error(
			'Production destruction is disabled; use the reviewed disaster recovery procedure'
		)
	}
	return [action, '--yes', '--stage', stage]
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { stage: { type: 'string' }, 'confirm-target': { type: 'string' } }
	})
	const args = stageCommand(
		positionals[0] ?? '',
		values.stage ?? '',
		requiredEnv('CLOUDFLARE_ACCOUNT_ID'),
		values['confirm-target']
	)
	// Never inherit the Node/Miniflare fallback into a native Workers build.
	if (
		process.env.HEXWARDENS_USE_WORKERS_SHIM ||
		process.env.HEXWARDENS_USE_WORKERS_SHIM_MEMORY
	) {
		throw new Error('Unset Workers shim flags before deployment')
	}
	const result = spawnSync(
		fileURLToPath(new URL('../node_modules/.bin/alchemy', import.meta.url)),
		args,
		{
			stdio: 'inherit',
			env: {
				...process.env,
				VITE_GAME_SERVER_URL: deploymentOrigins(values.stage ?? '').gameServer
			}
		}
	)
	if (result.error) {
		throw result.error
	}
	process.exitCode = result.status ?? 1
}
