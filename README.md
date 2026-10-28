# Hexwardens

Turn-based hex strategy in the browser. Command a tribe, develop villages, research technology, and fight over a seeded hex board. Play offline single-player or online multiplayer with server-authoritative matches.

## Run locally

Install [Vite+](https://viteplus.dev) or use the Node version in `.node-version` and the pnpm version in `package.json`.

```sh
pnpm install
cp .env.example .env
pnpm run dev
```

Open <http://localhost:3001>. The multiplayer server runs on port 8787. Development uses local Cloudflare emulation and a shared local D1 database; a Cloudflare account is not required. The example credentials are for local development only.

See [setup and troubleshooting](docs/setup.md) for workspace commands and tests.

## Repository

| Path                  | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `apps/web`            | React 19 and TanStack Start UI, auth, offline saves, wiki and PWA |
| `apps/game-server`    | Cloudflare Worker, multiplayer Durable Objects and HTTP API       |
| `packages/game-logic` | Deterministic TypeScript rules shared by browser and server       |
| `packages/api`        | Shared HTTP API contracts                                         |
| `packages/db`         | D1 schema and migrations                                          |
| `infra`               | Deployment configuration, generated local bindings and bootstrap  |

Read [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries, [CONTEXT.md](CONTEXT.md) for domain language, and [DESIGN.md](DESIGN.md) for the visual identity.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md). Commits and PR titles use Conventional Commits; Git hooks and the PR Gate enforce the format. Run `pnpm run check` before committing and `pnpm run validate` before handoff.

[Report a bug](https://github.com/brandhaug/hexwardens/issues/new/choose) with reproduction steps, browser/device details and the affected commit. Follow [SECURITY.md](SECURITY.md) for private vulnerability reports.

## Deploy

[The deployment guide](docs/deploying.md) covers the Alchemy bootstrap stack, GitHub environments and secrets, Cloudflare permissions, production deployment, previews, and recovery. Bootstrap creates deployment credentials; the application stack provisions Workers, Durable Objects and D1. CI deployment is enabled after bootstrap publishes the required secrets.

## License

Original source code is available under the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for models, animations, fonts and dependency licenses.
