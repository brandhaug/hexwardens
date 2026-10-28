import { defineConfig } from 'drizzle-kit'

// Drizzle Kit v1 writes nested `<timestamp>_<slug>/migration.sql` folders here
// and keeps snapshot state alongside each one. Wrangler can't read that
// layout, so `bun run db:generate` chains `scripts/sync-d1-migrations.ts` to
// flatten the latest `migration.sql` into `./migrations/NNNN_<slug>.sql` for
// Wrangler + the local-D1 fixtures to consume. Both directories are tracked.
export default defineConfig({
	schema: './src/schema.ts',
	out: './drizzle',
	dialect: 'sqlite'
})
