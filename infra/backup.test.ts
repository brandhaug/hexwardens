import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	decryptBackup,
	encryptBackup,
	verifyBackupAge
} from '../scripts/d1-backup.ts'

const key = Buffer.alloc(32, 1)
await test('backup encryption round trips SQL and detects tampering and wrong keys', () => {
	const sql = Buffer.from('CREATE TABLE user (id TEXT);')
	const encrypted = encryptBackup(sql, key)
	assert.deepEqual(decryptBackup(encrypted, key), sql)
	assert.throws(() => decryptBackup(encrypted, Buffer.alloc(32, 2)))
	encrypted.writeUInt8(
		encrypted.readUInt8(encrypted.length - 1) ^ 1,
		encrypted.length - 1
	)
	assert.throws(() => decryptBackup(encrypted, key))
	assert.throws(() => decryptBackup(Buffer.alloc(2), key))
})
await test('backup freshness refuses stale and future records', () => {
	const now = Date.parse('2026-09-28T12:00:00Z')
	verifyBackupAge('2026-09-28T02:00:00Z', now)
	for (const value of [
		'invalid',
		'2026-09-26T02:00:00Z',
		'2026-09-29T02:00:00Z'
	]) {
		assert.throws(() => verifyBackupAge(value, now))
	}
})
