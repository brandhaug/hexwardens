import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	stageResourceNames,
	validateOrigin,
	validateStage
} from './bindings.ts'
import { stageCommand } from '../scripts/alchemy-stage.ts'

await test('production names remain stable while previews isolate every resource', () => {
	assert.deepEqual(stageResourceNames('prod'), {
		database: 'hexwardens-db',
		web: 'hexwardens-web',
		gameServer: 'hexwardens-game-server'
	})
	assert.notDeepEqual(stageResourceNames('pr-7'), stageResourceNames('pr-8'))
	assert.equal(stageResourceNames('pr-7').database, 'hexwardens-pr-7-db')
})

await test('stage validation refuses arbitrary aliases and malformed previews', () => {
	for (const stage of [
		'',
		'production',
		'dev',
		'../prod',
		'pr-0',
		'pr-01',
		'pr-1;pwd',
		`pr-${'1'.repeat(50)}`
	]) {
		assert.throws(() => validateStage(stage))
	}
})

await test('deployment origins are exact HTTPS origins', () => {
	assert.equal(validateOrigin('https://hexwardens.gg'), 'https://hexwardens.gg')
	for (const origin of [
		'',
		' ',
		'*',
		'https://*.example.com',
		'http://example.com',
		'https://user:pass@example.com',
		'https://example.com/path',
		'https://example.com?x=1',
		'https://example.com#x',
		'https://example.com/'
	]) {
		assert.throws(() => validateOrigin(origin))
	}
})

await test('guard refuses mismatched targets and production teardown before command execution', () => {
	assert.throws(() => stageCommand('deploy', 'prod', 'abc', 'abc/pr-1'))
	assert.throws(() => stageCommand('destroy', 'prod', 'abc', 'abc/prod'))
	assert.throws(() => stageCommand('deploy', 'pr-1', '', '/pr-1'))
	assert.deepEqual(stageCommand('destroy', 'pr-1', 'abc', 'abc/pr-1'), [
		'destroy',
		'--yes',
		'--stage',
		'pr-1'
	])
})
