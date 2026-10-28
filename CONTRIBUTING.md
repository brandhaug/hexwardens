# Contributing to Hexwardens

Thanks for your interest in contributing!

## Getting started

```bash
bun install      # Bun is the package manager
bun run dev      # Start all apps via Turborepo
```

See [README.md](./README.md) for the project overview and [AGENTS.md](./AGENTS.md) for the full development guide — setup details, testing, code style, and the per-package docs index. [ARCHITECTURE.md](./ARCHITECTURE.md) describes the system as a whole.

## Before opening a pull request

- Run `bun run lint` and `bun run format:check`.
- Ensure tests pass: `cd apps/web && bun run test` and `cd packages/game-logic && bun run test`.
- Keep `packages/game-logic` free of UI/React imports — it runs on both the browser and Cloudflare Workers.
- If you change a subdomain's contract, update that subdomain's `AGENTS.md` in the same PR.

## Reporting bugs

Open a GitHub issue with reproduction steps. For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — please do not open a public issue.
