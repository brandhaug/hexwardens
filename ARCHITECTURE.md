# Architecture Overview

Rapid map of Hexwardens for agents. Update as the codebase evolves.

## System Diagram

```
            ┌──────────────────────────────┐
            │  Browser (React 19 + TSS)    │
            └───────┬──────────────┬───────┘
                    │ HTTP/SSR     │ WebSocket (JWT)
                    ▼              ▼
        ┌───────────────────┐  ┌───────────────────────────────┐
        │ apps/web          │  │ apps/game-server (CF Worker)  │
        │ TanStack Start    │  │ ┌──────────────┬────────────┐ │
        │ + better-auth     │  │ │ Matchmaker DO│  Match DO  │ │
        │ + game-token JWT  │  │ │ (lobbies)    │ (authoritative
        │ (CF Worker SSR)   │  │ │              │  game state)│ │
        └────────┬──────────┘  │ └──────┬───────┴─────┬──────┘ │
                 │             │        ▼             ▼        │
                 └─────────────┼───▶┌────────────────────────┐  │
                               │    │ D1 (hexwardens-db):       │  │
                               │    │ user/session/account/  │  │
                               │    │ verification (auth) +  │  │
                               │    │ match_results,         │  │
                               │    │ player_match_results   │  │
                               │    └────────────────────────┘  │
                               └───────────────────────────────┘
                    ▲                        ▲
                    └────── @hexwardens/game-logic (shared) ───────┘
```

Web mints a short-lived HS256 game token via `createServerContext(request).mintGameToken()` (auto user-vs-guest) with `AUTH_JWT_SECRET`. The browser connects to the game-server over WebSocket, passing the token via Authorization header (REST) or `?token=` query (WS upgrade). Match and Matchmaker DOs run the authoritative simulation using the shared `@hexwardens/game-logic` package — the same package the web client imports for rendering, bots, and fog-of-war projection.

## Components

### `apps/web` — React 19 SPA via TanStack Start (SSR)

Hosts game UI, online lobby, offline single-player at `/game`, leaderboard, profile, MDX wiki, and the `/api/auth/*` better-auth catchall. Mints game JWTs for the game-server WS. The offline `/game` route runs `createOfflineMatch()` from `@hexwardens/game-logic` (which drives `dispatch` + `snapshotFor` locally) and is the reference isomorphic path. Effect-backed TanStack Start server functions own session-bound work; typed Effect HTTP clients query the game-server for leaderboard and profile data. PWA shell via `vite-plugin-pwa` (workbox runtime caching, offline manifest). Stack: TanStack Start/Router/Query/Form, Vite, Tailwind, shadcn/ui, honeycomb-grid, @react-three/fiber, @react-three/drei, three, prando, Effect 4.0.0-rc.118. Deploy: Alchemy v2 `Cloudflare.Website.Vite` Worker (`hexwardens-web`), built through Alchemy’s Vite integration. Local Vite uses the shared-D1 Workers shim.

### `apps/game-server` — Cloudflare Worker (`hexwardens-game-server`)

- **Matchmaker DO** — lobbies, invite codes, slot config, bot assignment. REST: `POST /lobby/create`, `POST /lobby/join`; WS: `GET /lobby/{id}`.
- **Match DO** — authoritative game state per match, binary-encoded WS protocol (`encodeClientMessage` / `decodeServerMessage` from `@hexwardens/game-logic/multiplayer`). WS: `GET /match/{matchId}?token=`.

Stack: CF Workers, Durable Objects (SQLite-backed, hibernation-aware), D1, Wrangler 4, Effect 4.0.0-rc.118. Deploy: Alchemy v2 (`alchemy.run.ts`) provisions Worker, DO namespaces, D1 binding, and redacted `AUTH_JWT_SECRET`.

### `packages/game-logic` — `@hexwardens/game-logic`

Pure TypeScript, zero UI dependencies. Owns the action system, board/hex math, combat, fog-of-war, turns, bots and multiplayer codec. Both apps use `dispatch` for gameplay and `createMatchLogic` for match orchestration. `engine/` supplies normalized command-local storage through private indexed maps behind `GameWorld`. A pure command reducer handles match events; turns use an ordered synchronous loop and bots use a bounded async loop. Hosts and React consume immutable `GameState` projections. Effect provides schemas, typed results and host I/O; seeded Prando drives generation and bot decisions. See [ADR-0011](docs/adr/0011-normalized-engine-and-durable-xstate-matches.md) for the decision and its orchestration amendment.

### Simulation and commit boundaries

`createGameWorld` imports the last committed projection into a private candidate. Indexed tile, unit and player records hold gameplay data; metadata and board row dimensions stay private to the world. Unit records own positions, and an occupancy index joins units onto projected tiles. Domain unit IDs, row-major tile/unit iteration and player insertion order remain stable across hydration. Reads and changed projections are detached from the indexed records.

Commands mutate that candidate through validated `GameWorld` writes. A failed command discards the whole candidate, including earlier successful writes. Only a successful command returns a detached `GameState`; no-op worlds return their original input reference. `executeCommittedIntent` applies dispatch's exploration effects before the host commits the result. Fog projection retains the existing wire contract and omits the seed. Turn phases and bot scoring preserve gameplay rules and RNG call order.

`match/step.ts` routes commands directly to pure transformations in `transitions.ts`. Production and tests use the same reducer. Turn ownership and game-over eligibility come from `gameState`; optional `MatchState.execution` records only `bot-running` or `cleanup-pending`. Cleanup commits its terminal marker before deletion, allowing a failed delete to retry after reload while rejecting new connections. `checkpoint.ts` validates stored data once at host construction and converts the previous native XState checkpoint format without replaying effects.

`match/logic.ts` alone owns serialized local persistence, scheduler arming, the pump and abort-controller cancellation. Local storage commits before state broadcasts, action success replies or candidate lifecycle publication. Failure retains the previous committed state and sends a rejection so multiplayer can roll back optimism. Interrupted bot computation restarts from its committed turn boundary. Absolute deadlines survive restoration; failed terminal deletion retains its checkpoint for cleanup after reload. Recovery uses exponential retry delays capped at 30 seconds, with no finite attempt budget.

Every host awaits one `MatchPersistence.saveState` operation before replacing state or publishing effects. The offline adapter wraps the saved-match session's IndexedDB transaction in that port. Initialization is asynchronous for every host; `OfflineMatchHandle.ready()` gates initial access, and `send` and `endTurn` are asynchronous. The shared web `MatchClient` accepts synchronous or promise submissions so multiplayer can retain its optimistic overlay. Cloud saved-match replication and D1 match-result persistence run asynchronously after local commitment. New saves use `normalized-match-v4`; `normalized-xstate-v3` saves remain readable through checkpoint conversion, while earlier versions remain incompatible.

### `packages/db` — `@hexwardens/db`

Drizzle ORM schema and SQL migrations for D1 `hexwardens-db`. Exports `./schema` (tables), `./client` (Drizzle client over a D1 binding), `./effect` (Effect service wrapper). Used by both `apps/web` (better-auth tables, leaderboard/profile reads) and `apps/game-server` (match history writes). Schema: `packages/db/src/schema.ts`; migrations: `packages/db/migrations/`. For local app dev, run `pnpm run db:migrate:local` from the repo root so migrations apply to the game-server Wrangler state. Remote migrations apply via `pnpm -C packages/db db:migrate:remote`.

## Data Stores

- **D1 `hexwardens-db`** — shared by web (better-auth: `user`, `session`, `account`, `verification`) and game-server (match history: `match_results`, `player_match_results`). Leaderboard and profile views aggregate on the fly from `player_match_results`; there is no separate pre-aggregated stats table. DO state is transient; D1 is long-term. Schema and migrations live in `packages/db` (see component above).
- **DO SQLite** — in-flight lobby queues and committed match projections with execution markers across hibernation. Per-socket metadata lives in hibernation attachments.
- **Browser IndexedDB** — offline saved-match revisions, committed before local gameplay publication. Signed-in users replicate revisions asynchronously to the D1-backed saved-match service.

## Deployment & Infrastructure

- **Cloud:** Cloudflare (Workers, Durable Objects, D1).
- **IaC:** Alchemy v2 (`alchemy.run.ts`) declares shared D1, Matchmaker/Match/Presence DOs, native rate-limit bindings, redacted Worker secrets, the game-server Worker, and the web `Cloudflare.Website.Vite` deployment. `infra/bindings.ts` owns stage names and binding contracts; `infra/write-wrangler.ts` generates the checked local Wrangler configuration.
- **CI/CD:** `ci.yml` gates strict checks, tests, production/Storybook builds and sharded Playwright flows; `audit.yml` gates vulnerability and secret scans. Opt-in `deploy.yml` requires successful CI and Audit runs for the current default-branch commit before the protected production environment runs Alchemy. `preview.yml` owns isolated PR stages and its `destroy` job cleans them up. `backup.yml` owns encrypted D1 exports and an independent freshness check; restore requires a separate confirmed target. Environment protection and credentials must be configured before activation. See [infrastructure operations and activation](docs/audits/infrastructure-upgrades.md). The daily catalog-update workflow proposes dependency upgrades.
- **Logging:** Effect `Logger` wide events (canonical log lines) on both surfaces, written as structured JSON to the Workers Logs console stream. Game-server: `apps/game-server/src/wide-event.ts` (request-scoped `createRequestWideEvent`, DO-internal `createWideEvent`). Web: `apps/web/src/lib/wide-event-logger.ts`, provided per request by `runWithServerContext` (one `server_fn` event per Effect-backed server-function request). Wide events cover lobby lifecycle, match init/start/end, turn transitions, auth failures, WS errors, config validation, and persistence failures.

## Security

- **Web auth:** better-auth (email/password + username plugin), cookies bridged via `tanstackStartCookies()`. Schema: `packages/db/src/schema.ts`.
- **Game-server auth:** HS256 JWT minted by web via `createServerContext(request).mintGameToken()`, verified by game-server (`verifyGameToken` in `apps/game-server/src/auth.ts`). 1-hour expiry. Guests get random IDs.
- **Authorization:** Match DO validates acting-player ownership before mutating; Matchmaker enforces lobby membership.
- **Shared secret:** `AUTH_JWT_SECRET` — identical across web and game-server envs.
- **CORS:** `ALLOWED_ORIGIN` in `apps/game-server/wrangler.jsonc` is a comma-separated allowlist (default: localhost dev origins). Production deploys override it via Alchemy (`ALLOWED_ORIGIN` env in `alchemy.run.ts`). The worker entry rejects cross-origin requests (`Origin` header present) that aren't in the allowlist with 403 — including WebSocket upgrades to the Matchmaker and Match Durable Objects. Wildcard (`*`) is honored only for local development; never deploy with `*`.

## Dev & Testing

- **Local:** `pnpm install`, `pnpm run dev` (or `pnpm run dev:web`). Web on `http://localhost:3001`; game-server via `wrangler dev`.
- **Tests:** Vite+ bundled Vitest (globals on), `@testing-library/react` for web components, Miniflare D1 integration tests, and Node infrastructure checks. Shared game fixtures live under `packages/game-logic/src/test/`. Playwright in `apps/web/e2e` covers auth/security, multiplayer admission, offline bot turns, keyboard dialogs and rendered boards.
- **Tooling:** Vite+ Oxlint/Oxfmt, Fallow with a zero-debt gate, strict TypeScript 7 and native Effect diagnostics. Shared target ES2023. `.githooks/pre-commit` formats staged files; CI runs the complete quality gates.
- **Package manager:** pnpm 12.6.0 + Vite+ 1.0.0. Versions live in root `pnpm-workspace.yaml` `catalog`; apps reference via `"catalog:"`.

## Glossary

- **DO** — Durable Object (Cloudflare). Stateful, single-instance actor with own storage.
- **D1** — Cloudflare's managed SQLite.
- **TSS** — TanStack Start, full-stack React framework with SSR through its Vite integration.
- **Fog of War** — per-player visibility projection; `packages/game-logic/src/fog-of-war`.
- **Tribe** — a player's faction; `PlayerStateRecord` contains only participating tribes.
- **Match DO / Matchmaker DO** — Matchmaker owns lobbies, Match owns one authoritative game; the separate Presence DO counts online players.

## Project Identification

- **Name:** hexwardens (Hexwardens)
- **Repo:** https://github.com/brandhaug/hexwardens
- **Contact:** Martin Brandhaug
- **Last update:** 2026-05-04
