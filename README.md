# Hexwardens

Turn-based hex-strategy web game where players command tribes, grow villages,
research tech, and fight for control of a procedurally generated board.

The repo is a Vite+ monorepo with a React 19 + TanStack Start web app, a
Cloudflare Workers + Durable Objects multiplayer server, a shared pure
TypeScript game-logic package, and D1 database schema/migrations.

## Start Here

Use the Node version in `.node-version` and pnpm 12.6.0 from the repo root. Vite+ supplies the development tools.

```bash
pnpm install
pnpm run dev
```

The full dev stack runs locally:

- Web app: http://localhost:3001
- Game server: `wrangler dev` through the `game-server` workspace

## Project Map

```text
hexwardens/
├── apps/
│   ├── web/             TanStack Start web app, SSR worker, game UI, auth,
│   │                    lobby, offline /game route, wiki, PWA shell
│   └── game-server/     Cloudflare Worker with Matchmaker and Match Durable
│                        Objects for online multiplayer
├── packages/
│   ├── game-logic/      Pure TS rules engine shared by web and server
│   └── db/              Drizzle schema and D1 migrations
├── ARCHITECTURE.md      System diagram, data stores, deployment, security
├── CONTEXT.md           Canonical domain language
├── DESIGN.md            Visual identity, tokens, component contracts
└── AGENTS.md            Repo and subdomain instructions for coding agents
```

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the system overview and
[CONTEXT.md](./CONTEXT.md) for product language. The most important naming
rule: one playable session is a **Match**, not a game, room, or session.

## Architecture

The browser talks to two Cloudflare Worker surfaces:

- `apps/web` renders the app, handles better-auth, serves offline single-player,
  and mints short-lived game JWTs.
- `apps/game-server` owns online lobbies and authoritative matches through
  Durable Objects.

Both surfaces import `@hexwardens/game-logic`. Online matches run the shared rules
inside the Match Durable Object; the offline `/game` route runs the same
`dispatch` and `snapshotFor` path locally.

Core invariants:

- Server sends `FilteredGameState`; clients do not re-derive fog-of-war.
- Gameplay changes go through `dispatch()`.
- Gameplay randomness uses seeded `Prando`, not `Math.random`.
- `packages/game-logic` stays UI-free and Worker-compatible.
- Effect v4 beta patterns are required across Effect code.

## Common Commands

```bash
pnpm run dev                    # Start all apps via Vite+
pnpm run dev:web                # Start only the web app on :3001
pnpm run build                  # Build all workspaces
pnpm run lint                   # Run oxlint
pnpm run lint:fix               # Run oxlint with fixes
pnpm run format                 # Run oxfmt and write changes
pnpm run format:check           # Verify oxfmt formatting
pnpm run deploy                 # Deploy Cloudflare resources via Alchemy
pnpm run destroy                # Destroy Alchemy-managed resources
pnpm run db:generate            # Generate Drizzle migrations
pnpm run db:migrate:local       # Apply D1 migrations locally
pnpm run db:migrate:remote      # Apply D1 migrations remotely
```

Workspace-specific commands:

```bash
cd apps/web && pnpm run test
cd apps/web && pnpm run test:e2e
cd apps/game-server && pnpm run dev
cd apps/game-server && pnpm run test
cd packages/game-logic && pnpm run test
```

## Environment

The web app and game server share auth and persistence concerns:

- `AUTH_JWT_SECRET` must match between web and game-server for multiplayer.
- `BETTER_AUTH_URL` stays on `http://localhost:3001` in local development.
- `BETTER_AUTH_TRUSTED_ORIGINS` allows additional Better Auth origins.
- `ALLOWED_ORIGIN` controls game-server CORS and WebSocket origin checks.
- D1 database name is `hexwardens-db`.

Local game-server D1 migrations are run through the root `db:migrate:local`
script. The `packages/db` migration script remains available for the schema
package's own Wrangler config, but local app dev uses the game-server Wrangler
state.

## Testing

Vitest globals are enabled, so tests do not need to import
`describe`/`it`/`expect`.

```bash
cd apps/web && pnpm run test
cd packages/game-logic && pnpm run test
cd apps/game-server && pnpm run test
```

Run these before opening a PR:

```bash
pnpm run lint
pnpm run format:check
cd apps/web && pnpm run test
cd packages/game-logic && pnpm run test
```

## Code Style

- Package manager: Bun 1.3.3.
- Formatter: oxfmt.
- Linter: oxlint.
- Filenames: kebab-case.
- No barrel files.
- No type assertions with `as`; prefer type guards.
- No `console.log`, `console.warn`, or `console.error`.
- Dependency versions are centralized in the root `pnpm-workspace.yaml` `catalog`.

Both Worker apps log wide events (canonical log lines) through Effect's
`Logger` — one structured JSON event per request, emitted at completion. See
`apps/game-server/src/wide-event.ts` and `apps/web/src/lib/wide-event-logger.ts`.

## Packages

### `apps/web`

TanStack Start app with React 19, TanStack Router/Query/Form, TailwindCSS,
shadcn/ui, Better Auth, MDX wiki content, PWA support, and multiplayer client
code. The offline `/game` route is the reference local execution path for game
logic.

### `apps/game-server`

Cloudflare Worker with Durable Objects:

- Matchmaker DO: lobbies, invite codes, player slots, bot assignment.
- Match DO: authoritative match state and WebSocket protocol.

The server validates game JWTs from the web app and persists match results to
D1.

### `packages/game-logic`

Shared pure TypeScript rules engine. Owns actions, board math, combat,
fog-of-war, match orchestration, multiplayer codec, player state, turns, and
bot decisions. It must not import React, DOM APIs, or Node-only APIs.

### `packages/db`

Drizzle schema, Effect service wrapper, D1 client, and SQL migrations for
better-auth and match result tables.

## Deployment

Cloudflare infrastructure is declared in [alchemy.run.ts](./alchemy.run.ts):
D1, Durable Object namespaces, Worker bindings, game-server Worker, and the web
Worker deployment.

```bash
pnpm run deploy
```

There is no in-repo deployment workflow. Catalog updates are handled by the
scheduled GitHub workflow in `.github/workflows/catalog-update.yml`.
