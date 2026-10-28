import { execFileSync } from 'node:child_process'
import { expect, it } from 'vite-plus/test'

it('preserves app-bound checks through the published GitHub provider', () => {
	// Exercise the Node entrypoint used by the CLI, with every HTTP call intercepted.
	const output = execFileSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`
import assert from 'node:assert/strict'
import { Effect } from 'effect'
import { Provider } from 'alchemy/Provider'
import { BranchProtectionProvider } from '@alchemy.run/github/BranchProtection'
import { fromToken } from '@alchemy.run/github/Credentials'
const requests = []
globalThis.fetch = async (url, init) => {
  assert.ok(String(url).startsWith('https://api.github.com/repos/test/example/branches/master/protection'))
  if (init.method === 'PUT') requests.push(JSON.parse(init.body))
  return Response.json({ url: String(url), required_signatures: { enabled: false } })
}
const checks = ['CI gate', 'Conventional commit title']
for (const requiredStatusChecks of [
  { strict: true, checks: checks.map(context => ({ context, appId: 15368 })) },
  { strict: false, contexts: ['legacy'] },
  undefined
]) {
  await Effect.runPromise(Effect.gen(function* () {
    const provider = yield* Provider('GitHub.BranchProtection')
    yield* provider.reconcile({ news: {
      owner: 'test', repository: 'example', branch: 'master', requiredStatusChecks
    } })
  }).pipe(Effect.provide(BranchProtectionProvider()), Effect.provide(fromToken('test-only-token'))))
}
assert.deepEqual(requests.map(r => r.required_status_checks), [
  { strict: true, checks: checks.map(context => ({ context, app_id: 15368 })) },
  { strict: false, contexts: ['legacy'] },
  null
])
process.stdout.write('verified')
`
		],
		{ encoding: 'utf8', timeout: 30_000 }
	)
	expect(output).toBe('verified')
})
