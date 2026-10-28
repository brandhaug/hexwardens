# Deployment and recovery

Start with [bootstrap and deployment setup](docs/deploying.md) for GitHub environments, generated credentials and release enablement. This runbook covers runtime, migration and recovery details.

Alchemy owns both Workers, the shared D1 database and all three Durable Object classes. Deploying one Worker through Wrangler bypasses the paired web/game-server release and is not a supported production path. Generated Wrangler configurations are for local development only.

## Local runtime and configuration

`infra/bindings.ts` owns names, compatibility settings, local D1 identity, Durable Object classes and coarse native rate limits. Run `pnpm run infra:wrangler` followed by `pnpm run format` after changing it. CI runs `infra:check` to reject configuration drift.

Both local apps use database ID `placeholder` under `.wrangler-dev/state/v3/d1`. `HEXWARDENS_WRANGLER_PERSIST_TO` overrides the shared root for isolated tests; set the same path for both apps. The Miniflare 5 adapter uses `resourcePersistencePath` ending in `v3`. It records migrations in Wrangler's `d1_migrations` table and applies pending files atomically with their ledger entries. A legacy database without that ledger adopts only the initial migration after comparing every table and index definition against the committed schema. A mismatch fails without deleting data; export the local database before reconciling it.

Alchemy's `Cloudflare.Website.Vite` adds its native Workers runtime plugin to the TanStack Start build. Do not add `@cloudflare/vite-plugin` alongside it. Ordinary local development and tests may use the explicit Node/Miniflare shim; the deploy command rejects shim environment flags. See [Alchemy's integration guide](https://alchemy.run/cloudflare/frontend/tanstack-start/).

Verify shared local storage with `node scripts/check-shared-d1.ts`. It creates temporary storage, checks a web write from a separate Wrangler process, checks migration history, then verifies legacy adoption preserves the write.

## Stage and resource safety

Only `prod` and `pr-<positive PR number>` are accepted. Production keeps `hexwardens-db`, `hexwardens-web`, and `hexwardens-game-server`. A preview gets `hexwardens-pr-<number>-db`, `-web`, and `-game-server`, with separate DO namespaces and rate-limit namespace IDs. Never reuse production credentials or player data in previews.

The entry retains the existing Alchemy stack and logical resource IDs. D1 has a production retain policy, and the repository's destroy command rejects production unconditionally. These protections do not make arbitrary direct cloud commands safe. Before the first upgraded production release, inspect the Alchemy plan against the existing account and stage, and confirm it proposes no database or DO replacement. An older stack deployed under a user-named stage requires an explicit state migration; do not deploy a fresh `prod` stack over it blindly.

D1 migrations run before dependent Worker uploads. Alchemy uses `migrations: { dir }` and adopts Wrangler's migration ledger into `__alchemy_migrations`. This is a one-way bookkeeping migration. Keep SQL migrations append-only; do not return to the older Alchemy release or manually apply production migrations through Wrangler afterward.

## Required configuration

| Value                                           | Scope and purpose                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Deployment account and scoped deployment token.                                                      |
| `AUTH_JWT_SECRET`                               | Shared game token signing and verification secret.                                                   |
| `BETTER_AUTH_SECRET`                            | Session secret.                                                                                      |
| `BETTER_AUTH_URL`, `GAME_SERVER_URL`            | Optional exact HTTPS production origin overrides; otherwise discovered workers.dev origins are used. |
| `ALLOWED_ORIGIN`                                | Optional comma-separated game-server CORS origins. Defaults to the web origin.                       |
| `BETTER_AUTH_TRUSTED_ORIGINS`                   | Optional extra exact HTTPS origins. Defaults to the web origin.                                      |
| `CLOUDFLARE_WORKERS_SUBDOMAIN`                  | Account subdomain, discovered by the deployment wrapper and workflows when needed.                   |

Store secrets in GitHub environments or a secrets manager. Never commit them. Bootstrap restricts `production` to the default branch. Configure reviewers in `deployment.config.ts` when deployment approval is required; self-approval is disabled when reviewers are configured. Plain URLs belong in environment variables.

## Production release

The `Deploy` workflow is inactive until bootstrap sets `DEPLOY_ENABLED=true`. It only deploys the current default-branch commit after both CI and Audit succeeded for that exact push. Bootstrap requires `CI gate` and `Conventional commit title` for PR merges, bound to the GitHub Actions app. Audit findings do not block PR merges. See [deployment setup](docs/deploying.md#branch-protection). Review workflow and infrastructure changes.

For a reviewed manual release from a clean, validated checkout:

```sh
pnpm run infra:check
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run deploy --confirm-target="$CLOUDFLARE_ACCOUNT_ID/prod"
```

The confirmation must match the exported account exactly. The guarded deploy derives `VITE_GAME_SERVER_URL` from the same stage URL as the server binding, so client REST calls cannot accidentally target another stage. No production command was run as part of the upgrade. After deployment, the workflow probes the game-server `/health` and web `/` with bounded retries and request timeouts. Also sign in, create a private lobby, start a bots match and play a turn. Watch Workers Logs for `config_invalid`, `auth_failed`, `persistence_failure`, `cors_rejected` and health failures.

A failed upload can leave only one Worker updated. Deployments are atomic per Worker, not across the stack. Keep protocol and persisted DO state changes backward-compatible, and drain active matches before incompatible changes. Neither D1 export nor Time Travel backs up active match state in Durable Objects.

## Preview lifecycle

Bootstrap enables previews after publishing separate-account credentials. Configure preview reviewers in `deployment.config.ts` to require approval before running same-repository PR code. Forks and Dependabot are excluded. Bootstrap publishes `PREVIEW_CLOUDFLARE_ACCOUNT_ID`, `PREVIEW_CLOUDFLARE_API_TOKEN`, `PREVIEW_AUTH_JWT_SECRET`, and `PREVIEW_BETTER_AUTH_SECRET`. Production secrets must not exist at repository scope.

The `preview-cleanup` environment uses the same preview-only credentials and permits the default branch without approval. Closing a PR runs cleanup from trusted default-branch code. Deploy and destroy share a non-cancelling concurrency group so Alchemy state mutations finish before cleanup. The job summary lists preview URLs; no demo credentials or production snapshot are seeded.

GitHub concurrency queues are not durable cleanup queues. A newer pending run can replace a pending close event. Review preview account resources regularly and rerun failed or lost cleanup manually from trusted code:

```sh
pnpm run destroy:stage --stage=pr-42 --confirm-target="$CLOUDFLARE_ACCOUNT_ID/pr-42"
```

## Backups and recovery

Cloudflare Time Travel can restore D1 to a retained timestamp or bookmark. Retention depends on the plan, so verify it in the account. A restore discards later writes and must happen during a maintenance window. See [Cloudflare's Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

The optional `D1 backup` workflow exports production D1 daily, encrypts SQL with AES-256-GCM before upload to an S3-compatible store, and uploads an authenticated completion record last. A separate schedule verifies the newest completed backup is less than 26 hours old, checks its hash and authentication tag, restores into disposable local D1, and checks SQLite integrity and foreign keys. Incomplete uploads never replace a complete backup. There is deliberately no scripted remote restore command.

Before setting `BACKUP_ENABLED=true`, configure the `backup` environment:

- Secrets: `BACKUP_CLOUDFLARE_ACCOUNT_ID`, `BACKUP_CLOUDFLARE_API_TOKEN`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`.
- Variables: `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, optional `BACKUP_S3_REGION`.
- The encryption key is 32 random bytes encoded as 64 hexadecimal characters. Keep a recovery copy outside GitHub and retain prior keys until their backups expire.
- Use a dedicated private bucket, versioning, and a lifecycle policy retaining encrypted objects for at least 30 days. The backup principal needs list/read/write under `hexwardens-db/`, not delete access. Configure storage durability and lifecycle in the account; this repository does not silently delete old backups.
- Use a narrowly scoped Cloudflare export token. Restrict this environment to the default branch, with no approval gate that would stall unattended backups. Enable failed-workflow notifications and an external alert on missed backup/freshness runs.
- GitHub's Ubuntu runner supplies AWS CLI. Local operation requires the same CLI and the pinned Wrangler dependencies.

Commands are `node scripts/d1-backup.ts backup`, `freshness`, and `restore-drill`. A drill writes plaintext only inside a mode-0700 temporary directory and removes it in `finally`. The workflow never uploads plaintext or database dumps as GitHub artifacts. Large databases need a measured export window and restore budget before enabling the schedule; the current command timeout is five minutes per provider operation.

For disaster recovery, stop writes, preserve the current database, verify a known-good recovery point, and obtain an explicit review of the destination account/database and expected data loss. Restore through the Cloudflare runbook, then recheck schema, authentication, player profiles and match results before reopening traffic. Code rollback uses a forward-compatible rebuild of the last good application version against the current infrastructure and migration bookkeeping.

## External prerequisites

Account tokens, protected environments, branch rules, custom domain/TLS setup, backup storage, encryption key escrow, Time Travel retention, real restore drills and production health checks require account access. They remain operator work and are not claimed as validated by local checks. Configure log retention, uptime monitoring, alerts and billing limits before launch.
