import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Drizzle Kit v1 writes nested `<timestamp>_<slug>/migration.sql` folders
// (`./drizzle`); Wrangler expects flat `NNNN_<slug>.sql` files
// (`./migrations`). This script derives the flat directory from Drizzle's
// native output. Run after every `drizzle-kit generate` — chained from
// `package.json` `db:generate`. Both directories are committed: `./drizzle`
// holds the diff state Drizzle needs, `./migrations` is what Wrangler + the
// local D1 fixtures actually apply.

const here = import.meta.dirname
const root = dirname(here)
const src = join(root, 'drizzle')
const dest = join(root, 'migrations')

await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })

const entries = await readdir(src, { withFileTypes: true })
const dirs = entries
	.flatMap((entry) => (entry.isDirectory() ? [entry.name] : []))
	.toSorted()

await Promise.all(
	dirs.map((dir, i) => {
		const slug = dir.split('_').slice(1).join('_') || dir
		const flatName = `${String(i).padStart(4, '0')}_${slug}.sql`
		return cp(join(src, dir, 'migration.sql'), join(dest, flatName))
	})
)

const noun = dirs.length === 1 ? 'migration' : 'migrations'
console.log(`Synced ${dirs.length} ${noun} → packages/db/migrations`)
