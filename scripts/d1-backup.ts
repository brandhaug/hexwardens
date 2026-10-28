import { Schema } from 'effect'
import { spawnSync } from 'node:child_process'
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes
} from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requiredEnv, stageResourceNames } from '../infra/bindings.ts'

const magic = Buffer.from('HEXWARDENS-D1-1\0')
export function encryptBackup(plaintext: Buffer, key: Buffer): Buffer {
	const nonce = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', key, nonce)
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
	return Buffer.concat([magic, nonce, cipher.getAuthTag(), ciphertext])
}
export function decryptBackup(data: Buffer, key: Buffer): Buffer {
	if (
		data.length < magic.length + 28 ||
		!data.subarray(0, magic.length).equals(magic)
	) {
		throw new Error('Invalid backup header')
	}
	const decipher = createDecipheriv(
		'aes-256-gcm',
		key,
		data.subarray(magic.length, magic.length + 12)
	)
	decipher.setAuthTag(data.subarray(magic.length + 12, magic.length + 28))
	return Buffer.concat([
		decipher.update(data.subarray(magic.length + 28)),
		decipher.final()
	])
}
export function verifyBackupAge(createdAt: string, now = Date.now()): void {
	const age = now - Date.parse(createdAt)
	if (!Number.isFinite(age) || age < 0 || age > 26 * 60 * 60 * 1000) {
		throw new Error('Backup is stale or has an invalid timestamp')
	}
}
function run(binary: string, args: string[]): string {
	const result = spawnSync(binary, args, {
		encoding: 'utf8',
		timeout: 5 * 60 * 1000,
		maxBuffer: 16 * 1024 * 1024
	})
	// CLI output can contain signed export URLs or SQL. Never print it on failure.
	if (result.error || result.status !== 0) {
		throw new Error(
			`${binary.split('/').pop()} failed; inspect the provider locally`
		)
	}
	return result.stdout
}
const parseCompletion = Schema.decodeUnknownSync(
	Schema.Struct({
		objectKey: Schema.String,
		sha256: Schema.String,
		createdAt: Schema.String,
		database: Schema.String
	})
)
const parseDatabases = Schema.decodeUnknownSync(
	Schema.Array(
		Schema.Struct({
			name: Schema.String,
			uuid: Schema.String
		})
	)
)
const parseListing = Schema.decodeUnknownSync(
	Schema.Struct({
		Contents: Schema.optional(
			Schema.Array(Schema.Struct({ Key: Schema.String }))
		)
	})
)
const verifyRestore = Schema.decodeUnknownSync(
	Schema.Tuple([
		Schema.Struct({
			results: Schema.Tuple([
				Schema.Struct({ integrity_check: Schema.Literal('ok') })
			])
		}),
		Schema.Struct({ results: Schema.Tuple([]) })
	])
)

function main(): void {
	const action = process.argv[2]
	if (
		action !== 'backup' &&
		action !== 'freshness' &&
		action !== 'restore-drill'
	) {
		throw new Error('Expected backup, freshness or restore-drill')
	}
	const database = stageResourceNames('prod').database
	const bucket = requiredEnv('BACKUP_S3_BUCKET')
	if (!/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(bucket)) {
		throw new Error('Invalid backup bucket')
	}
	const endpoint = new URL(requiredEnv('BACKUP_S3_ENDPOINT'))
	if (
		endpoint.protocol !== 'https:' ||
		endpoint.username ||
		endpoint.password ||
		endpoint.search ||
		endpoint.hash
	) {
		throw new Error(
			'Backup storage requires an HTTPS endpoint without credentials'
		)
	}
	const keyHex = requiredEnv('BACKUP_ENCRYPTION_KEY')
	if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
		throw new Error('Backup encryption key must be 32 bytes encoded as hex')
	}
	const key = Buffer.from(keyHex, 'hex')
	const folder = mkdtempSync(join(tmpdir(), 'hexwardens-backup-'))
	const wrangler = fileURLToPath(
		new URL('../apps/game-server/node_modules/.bin/wrangler', import.meta.url)
	)
	const config = fileURLToPath(
		new URL('../packages/db/wrangler.jsonc', import.meta.url)
	)
	const prefix = `${database}/`
	const storageArgs = ['--endpoint-url', endpoint.href, '--no-cli-pager']
	const encryptedPath = join(folder, 'backup.enc')
	const completionPath = join(folder, 'completion.enc')
	const sqlPath = join(folder, 'backup.sql')
	function upload(path: string, objectKey: string) {
		run('aws', [
			...storageArgs,
			's3',
			'cp',
			path,
			`s3://${bucket}/${objectKey}`,
			'--only-show-errors'
		])
	}
	function download(objectKey: string, path: string) {
		run('aws', [
			...storageArgs,
			's3',
			'cp',
			`s3://${bucket}/${objectKey}`,
			path,
			'--only-show-errors'
		])
	}
	try {
		if (action === 'backup') {
			requiredEnv('CLOUDFLARE_ACCOUNT_ID')
			requiredEnv('CLOUDFLARE_API_TOKEN')
			// Generated Wrangler configs deliberately carry a local placeholder ID.
			// Resolve the production name in the explicitly selected account, then
			// create a temporary remote config instead of rewriting local bindings.
			const databases = parseDatabases(
				JSON.parse(run(wrangler, ['d1', 'list', '--json']))
			)
			const ids = databases.flatMap((item) =>
				item.name === database && /^[0-9a-f-]{36}$/i.test(item.uuid)
					? [item.uuid]
					: []
			)
			if (ids.length !== 1) {
				throw new Error(
					'Expected exactly one production database in the selected account'
				)
			}
			const remoteConfig = join(folder, 'remote.json')
			writeFileSync(
				remoteConfig,
				JSON.stringify({
					d1_databases: [
						{ binding: 'DB', database_name: database, database_id: ids[0] }
					]
				}),
				{ mode: 0o600 }
			)
			const createdAt = new Date().toISOString()
			run(wrangler, [
				'd1',
				'export',
				database,
				'--remote',
				'--config',
				remoteConfig,
				'--output',
				sqlPath
			])
			const plaintext = readFileSync(sqlPath)
			if (plaintext.length === 0) {
				throw new Error('D1 export is empty')
			}
			const objectKey = `${prefix}${createdAt.replaceAll(':', '-')}-${randomBytes(8).toString('hex')}.sql.enc`
			const encrypted = encryptBackup(plaintext, key)
			const evidence = {
				database,
				objectKey,
				createdAt,
				sha256: createHash('sha256').update(encrypted).digest('hex')
			}
			writeFileSync(encryptedPath, encrypted, { mode: 0o600 })
			writeFileSync(
				completionPath,
				encryptBackup(Buffer.from(JSON.stringify(evidence)), key),
				{ mode: 0o600 }
			)
			upload(encryptedPath, objectKey)
			// A partial upload never creates a completion record or displaces a usable backup.
			upload(completionPath, `${objectKey}.complete.enc`)
			process.stdout.write(`${JSON.stringify(evidence)}\n`)
			return
		}
		const listing = parseListing(
			JSON.parse(
				run('aws', [
					...storageArgs,
					's3api',
					'list-objects-v2',
					'--bucket',
					bucket,
					'--prefix',
					prefix,
					'--output',
					'json'
				])
			)
		)
		const keys = (listing.Contents ?? []).flatMap((item) =>
			item.Key.endsWith('.complete.enc') ? [item.Key] : []
		)
		const latest = keys.toSorted().at(-1)
		if (!latest) {
			throw new Error('No completed backup found')
		}
		download(latest, completionPath)
		const evidence = parseCompletion(
			JSON.parse(
				decryptBackup(readFileSync(completionPath), key).toString('utf8')
			)
		)
		if (
			evidence.database !== database ||
			latest !== `${evidence.objectKey}.complete.enc` ||
			!evidence.objectKey.startsWith(prefix)
		) {
			throw new Error('Backup target mismatch')
		}
		verifyBackupAge(evidence.createdAt)
		download(evidence.objectKey, encryptedPath)
		const encrypted = readFileSync(encryptedPath)
		if (
			createHash('sha256').update(encrypted).digest('hex') !== evidence.sha256
		) {
			throw new Error('Backup checksum mismatch')
		}
		const sql = decryptBackup(encrypted, key)
		if (action === 'restore-drill') {
			// No remote restore mode exists. Every drill uses fresh isolated local storage.
			writeFileSync(sqlPath, sql, { mode: 0o600 })
			const localArgs = [
				'--local',
				'--config',
				config,
				'--persist-to',
				join(folder, 'restore')
			]
			run(wrangler, [
				'd1',
				'execute',
				database,
				...localArgs,
				'--file',
				sqlPath
			])
			const checks = run(wrangler, [
				'd1',
				'execute',
				database,
				...localArgs,
				'--json',
				'--command',
				'PRAGMA integrity_check; PRAGMA foreign_key_check;'
			])
			verifyRestore(JSON.parse(checks))
		}
		process.stdout.write(
			`${JSON.stringify({ ...evidence, verified: action })}\n`
		)
	} finally {
		rmSync(folder, { recursive: true, force: true })
		key.fill(0)
	}
}
if (import.meta.main) {
	main()
}
