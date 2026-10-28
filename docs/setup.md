# Local setup

Use the Node version in `.node-version` and pnpm version in `package.json`. Vite+ manages both when installed using its official setup instructions. Run commands from the repository root unless a workspace is specified.

```sh
pnpm install
cp .env.example .env
pnpm run dev
```

`scripts/dev.ts` loads the root `.env` into both app processes. The example auth secret and JWT secret are deliberately public development values. Keep web and game-server JWT values identical when changing them. Production receives separate secrets through bootstrap.

The web app uses port 3001; the game server uses port 8787. Stop unrelated processes on those ports before testing. `pnpm run dev:web` starts only the web app, which supports offline play. Online multiplayer needs both processes.

Local D1 state is shared under `.wrangler-dev/state`. The web shim applies migrations on first use; `pnpm run db:migrate:local` applies the same tracked migrations explicitly. No remote database or Cloudflare login is needed. Preserve this directory if you want to keep local accounts and matches.

## Validation

```sh
pnpm run check
pnpm -C apps/web exec playwright install chromium
pnpm run validate
```

`check` runs typechecking, native Effect diagnostics, lint, formatting, dead-code checks and tests. `validate` also builds, checks generated infrastructure, applies local migrations, and runs Playwright. On Linux, Playwright may need `playwright install --with-deps chromium`. Browser tests require local process and port access.

Useful focused checks:

```sh
pnpm -C packages/game-logic test
pnpm -C apps/web test
pnpm -C apps/game-server test
pnpm run test:scripts
pnpm run infra:check
```

## Tooling and dependencies

Dependency versions belong in the root `pnpm-workspace.yaml` catalog. Run `pnpm install` after a catalog change and commit the lockfile. CI uses a frozen lockfile. `pnpm run format` applies oxfmt, while `pnpm run lint:fix` applies available lint fixes. Re-run `pnpm run check` after fixes.

The pre-commit hook formats staged files without swallowing partial staging. The commit-message hook validates the subject. Run `pnpm install` again if hooks are missing after moving a checkout.

## Troubleshooting

- A missing `.env` error means the root example has not been copied. Workspace-level `.env` files are unnecessary when using the root dev commands.
- A missing auth binding usually means a workspace dev command was run without the root environment. Start with `pnpm run dev`.
- A local schema mismatch requires reconciling or exporting the local database. Do not delete persistent state just to silence the error.
- Generated Wrangler drift is repaired with `pnpm run infra:wrangler`, followed by reviewing the diff.
