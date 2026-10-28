# Hexwardens

Turn-based hex strategy. React 19 and TanStack Start web app, Cloudflare Workers and Durable Objects multiplayer host, shared pure-TypeScript rules. pnpm workspace with Vite+ tooling.

## Read by task

| Area                             | Instructions                                                   |
| -------------------------------- | -------------------------------------------------------------- |
| Web, SSR, UI, offline saves      | [apps/web/AGENTS.md](apps/web/AGENTS.md)                       |
| Multiplayer host and API         | [apps/game-server/AGENTS.md](apps/game-server/AGENTS.md)       |
| Rules and simulation             | [packages/game-logic/AGENTS.md](packages/game-logic/AGENTS.md) |
| CI, secrets, contribution checks | [.github/AGENTS.md](.github/AGENTS.md)                         |
| Alchemy, bootstrap, deployment   | [infra/AGENTS.md](infra/AGENTS.md)                             |

Use [CONTEXT.md](CONTEXT.md) for domain terms, [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries, [PRODUCT.md](PRODUCT.md) for product intent, and [DESIGN.md](DESIGN.md) for visual contracts. Read [local setup](docs/setup.md) when changing development tooling and [deployment](docs/deploying.md) before remote operations.

## Working conventions

- Use pnpm. Dependency versions live in the root `pnpm-workspace.yaml` catalog; workspace manifests use `catalog:`. Run `pnpm install` after version changes.
- Run `pnpm run check` before committing and `pnpm run validate` before handoff. Report blocked checks honestly. Formatting uses oxfmt; lint uses oxlint; typecheck includes TypeScript 7 and native Effect diagnostics.
- Commits and PR titles use Conventional Commits. Install hooks with `pnpm install`; pre-commit formats staged files and commit-msg checks the subject. Fill the PR template from the final diff and observed results. Squash merges use the PR title.
- Kebab-case files, direct module imports, no new barrels or type assertions. Use type guards. Follow existing module ownership rather than introducing parallel helpers.
- Use the pinned Effect v4 APIs. Read the Effect skill and installed source before changing Effect code; v3 patterns are incompatible.
- Keep private research, credentials, local state and bootstrap outputs out of commits. Environment examples contain only local-development values. Never print secrets or copy development credentials into production.

## Cross-cutting contracts

1. `dispatch()` is the only gameplay action entry point; hosts never call feature handlers directly.
2. The server sends `FilteredGameState`; clients never re-derive fog. Offline play uses local `dispatch` and `snapshotFor`.
3. Gameplay uses seeded Prando from `state.seed`; bots receive an RNG. No `Math.random` in gameplay.
4. `packages/game-logic` stays free of React, DOM and Node-only APIs.
5. Both apps share one D1 database. Local processes share `.wrangler-dev/state` and the generated `placeholder` database ID.
6. Both apps emit one structured Effect wide event per request/lifecycle moment. Preserve matching field names and request-scoped span timing. Logging ownership is documented in each app's Intent Node; never add scattered console logging.

Update the nearest child Intent Node when a module contract changes. Put contributor procedures in [CONTRIBUTING.md](CONTRIBUTING.md), operational steps in `docs/`, and shared invariants here. Keep existing `CLAUDE.md` symlinks pointing to their corresponding `AGENTS.md`.
