# Hexwardens — AGENTS.md

Turn-based hex-strategy web game. Vite+ and pnpm monorepo: React 19 + TanStack Start web app, Cloudflare Workers + Durable Objects multiplayer server, and a shared pure-TS game-logic package.

See [CONTEXT.md](./CONTEXT.md) for canonical domain language used by `grill-with-docs`. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system diagram, component descriptions, data stores, deployment, and security model. See [PRODUCT.md](./PRODUCT.md) for design strategy — register (`brand`), users, product purpose, brand personality, anti-references, design principles, and accessibility commitments (the _why_). See [DESIGN.md](./DESIGN.md) for the canonical visual identity — design tokens, typography, and component contracts (the _what_; follows the [google-labs-code/design.md](https://github.com/google-labs-code/design.md) spec).

## Intent Node index

| Area                                         | Intent Node                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Web app (SSR + game UI + multiplayer client) | [`apps/web/AGENTS.md`](apps/web/AGENTS.md)                       |
| Multiplayer server (CF Workers + DOs)        | [`apps/game-server/AGENTS.md`](apps/game-server/AGENTS.md)       |
| Game logic (shared, pure TS)                 | [`packages/game-logic/AGENTS.md`](packages/game-logic/AGENTS.md) |

Game-logic has per-subdomain nodes for `actions/`, `board/`, `combat/`, `domains/`, `fog-of-war/`, `match/`, `multiplayer/`, `player/`, `turns/`, and `bot/` — see the package node for the map.

## Setup

```bash
pnpm install         # pnpm is the package manager
pnpm run dev          # Start all apps via Vite+
pnpm run dev:web      # Web app only (Vite on :3001)
pnpm run build        # Build all apps
```

- Web dev server: `http://localhost:3001`
- Game server: `wrangler dev` (Cloudflare Workers local)
- Path alias: `@/*` → `apps/web/src/*`
- Local D1 is **shared** between web and game-server in dev: both miniflare instances point at `<repo>/.wrangler-dev/state` (web via `d1Persist` in `cloudflare-workers-shim.ts`, game-server via `wrangler dev --persist-to`). They use the same `database_id` (`placeholder` in `apps/game-server/wrangler.jsonc`) so they hash to the same SQLite file. Mirrors the prod invariant that both apps see one D1.

## Testing

- Web: `cd apps/web && pnpm run test`
- Game logic: `cd packages/game-logic && pnpm run test`
- Vitest globals are enabled — no need to import `describe`/`it`/`expect`.
- Shared test fixtures: `apps/web/src/test/`, `packages/game-logic/src/test/`. Tests live alongside source or under `__tests__`.

## Repo-wide code style

- Formatter: **oxfmt** — `pnpm run format` / `pnpm run format:check`.
- Linter: **oxlint** — `pnpm run lint` / `pnpm run lint:fix`.
- Typecheck: **TypeScript 7** plus **native Effect diagnostics** — `pnpm run typecheck` runs workspace checks through Vite+. Effect workspaces run `tsc --noEmit && effect-tsgo diagnostics --project tsconfig.json --strict`; the compiler and diagnostics are separate CI gates. The JavaScript Effect language-service CLI does not support TypeScript 7; use `@effect/tsgo`.
- Strict lint policy lives in `lint.config.ts`, with custom domain rules in `packages/oxlint-plugin`. Document narrowly scoped host or framework exceptions at their boundary.
- Pre-commit hook (`.githooks/pre-commit`) formats only staged files through `vp staged`, preserving partial staging. Run full checks explicitly before committing; CI enforces them.
- **Kebab-case filenames** (`tile-actions.ts`, `game-state.ts`).
- **No barrel files** (`index.ts` re-exports) — import from specific modules.
- **No type assertions (`as`)** — use type guards (`isTribe`, `isDifficulty`, etc.).
- **No `console.log/warn/error`.** Server-side: log through the Effect wide-event logger.

## Logging (Effect wide events)

- Both apps log through Effect's `Logger`: one structured JSON **wide event** (canonical log line) per request / lifecycle moment, written to the Workers Logs console stream by the logger layer. No other sink, no scattered log lines.
- Game-server: `apps/game-server/src/wide-event.ts` owns the logger layer plus the imperative accumulators the Durable Object handlers use — `createRequestWideEvent(request)` / `createWideEvent()`, then `log.set(...)` to deep-merge context and `log.emit(...)` exactly once at completion (`log.error(...)` attaches a structured error and upgrades the level).
- Web: `apps/web/src/lib/wide-event-logger.ts` owns the logger layer; `runWithServerContext` provides it and emits one `server_fn` wide event (outcome, duration, error context) per Effect-backed server-function request. Effect-native code can also `Effect.log({...})` directly against the layer.
- Keep field names in parity across both apps (`match.id`, `lobby.id`, `player.id`, `http.method`, `http.path`, `error.*`) so dashboards aggregate across surfaces.
- Span timings ride along: both apps fold finished Effect spans (`Effect.withSpan`, `Effect.fn`, the db `query()` wrapper) into the wide event as `spans.<name> = { ms, count }` via a request-scoped `Tracer` — see `apps/game-server/src/wide-event.ts` and `apps/web/src/lib/wide-event-logger.ts`.

## Dependency management

- Versions are centralized in the root `pnpm-workspace.yaml` `catalog` field.
- Apps reference versions via `"catalog:"` — update versions in the root catalog, not in app `package.json` files.
- Run `pnpm install` from the repo root after changing the catalog.

## Cross-cutting invariants (true everywhere, so stated here once)

1. **Fog-of-war boundary.** Server always ships `FilteredGameState` over the wire; client never re-derives fog. Offline `/game` route runs `dispatch` + `snapshotFor` locally and is the reference isomorphic path.
2. **`dispatch()` is the only gameplay entry point.** Actions, moves, attacks all go through `@hexwardens/game-logic/dispatch`. UI and server both call it; neither calls individual feature handlers directly.
3. **Determinism.** Seeded `Prando` via `state.seed`; no `Math.random` in gameplay paths. Bots inject an `rng`.
4. **`packages/game-logic` is UI-free.** No React, DOM, or Node-only APIs — it builds for both the Vite bundle and the Cloudflare Workers runtime. Restricted imports enforce this boundary.
5. **Effect v4.** Pinned at `4.0.0` in the catalog and used pervasively for schemas, tagged errors, services, and layers across web, game-server, and game-logic. v3 patterns (e.g. `Effect.gen` adapter, `Effect.provideLayer`) will not compile — see the `effect` skill before writing Effect code.

## Pull Request guidelines

- Run `pnpm run lint`, `pnpm run format:check`, and `pnpm run typecheck` before committing.
- Ensure tests pass in both `apps/web` and `packages/game-logic`.
- Keep `packages/game-logic` free of UI/React imports.
- Update the relevant child Intent Node in the same PR when you change a subdomain's contract. Parents link down — leaf nodes are where new invariants land.

## External references

- Multiplayer architecture: Cloudflare Durable Objects + Alchemy IaC, sync-first design with a forfeit model for disconnects — see [`apps/game-server/AGENTS.md`](apps/game-server/AGENTS.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).
- Intent Layer concept: https://intent-systems.com/blog/intent-layer
