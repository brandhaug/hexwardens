import { execFileSync } from 'node:child_process'
import { expect, it } from 'vite-plus/test'

it('sends mutually exclusive status-check fields from the compiled Alchemy provider', () => {
	// A separate Node process exercises the published JS entrypoint used by the CLI.
	const output = execFileSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`
import assert from 'node:assert/strict'
import { Effect } from 'effect'
import { Provider } from 'alchemy/Provider'
import { BranchProtectionProvider } from 'alchemy/GitHub/BranchProtection'
import { fromToken } from 'alchemy/GitHub/Credentials'
const requests = []
globalThis.fetch = async (url, init) => {
  assert.ok(String(url).startsWith('https://api.github.com/repos/test/example/branches/master/protection'))
  if (init.method === 'PUT') requests.push(JSON.parse(init.body))
  return Response.json({ url: String(url), required_signatures: { enabled: false } })
}
for (const requiredStatusChecks of [
  { strict: true, checks: [{ context: 'CI gate', appId: 15368 }] },
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
  { strict: true, checks: [{ context: 'CI gate', app_id: 15368 }] },
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
