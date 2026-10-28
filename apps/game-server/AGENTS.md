# apps/game-server

## Purpose & Scope

Cloudflare Workers + Durable Objects host for real-time multiplayer. Two DOs: `Matchmaker` (lobby, pairing, match creation) and `Match` (authoritative per-match state and WebSocket hub). Pure I/O adapter: all gameplay logic comes from `@hexwardens/game-logic` — this app only supplies ports (`persistence`, `broadcast`, `scheduler`, `clock`, `codec`, `log`) bound to Cloudflare primitives, plus JWT auth and D1 persistence of match results.

## Entry Points & Contracts

- `src/index.ts` — Worker entry. Delegates to `request-handler.ts` and re-exports the Durable Object classes.
- `src/request-handler.ts` — Routes REST + WebSocket upgrades. Validates env config (`config.ts`) and applies the CORS gate via `cors.ts` before any Durable Object dispatch; misconfiguration returns 500 with a `config_invalid` wide event.
- `src/config.ts` — Effect `Config`-validated env: `AUTH_JWT_SECRET` as a non-empty `Redacted` string, `ALLOWED_ORIGIN` parsed into the `CorsPolicy`. `envConfigFor(env)` is the Effect-typed read; `loadEnvConfig(env)` is the cached synchronous edge for DO constructors, throwing loudly on misconfiguration. Never read `env.AUTH_JWT_SECRET` directly past this module.
- `src/cors.ts` — `ALLOWED_ORIGIN` parser, gate, and overlay. Single source of truth for CORS; Durable Objects emit no `Access-Control-Allow-Origin` header — the worker overlays it once on the way out (`withCorsOrigin`). Cross-origin requests from disallowed origins get 403 before auth and before reaching any DO.
- `src/platform-rate-limit.ts` applies the native `GAME_RATE_LIMITER` binding before Durable Object dispatch. Public hosts fail closed with 503 if the binding is absent or fails. Missing bindings are allowed only when the request and configured origins are local. `src/http-rate-limit.ts` adds stricter per-isolate, scope-specific buckets for lobby mutations, public queues and WebSocket upgrades, using Cloudflare's trusted client identity. `HEXWARDENS_DISABLE_RATE_LIMIT=1` bypasses only these local buckets after the local-origin check; it is never a production bypass. Limits return 429 with `Retry-After`; rejected requests retain the CORS and private-cache headers. The web's corresponding boundaries are `platform-rate-limit.ts` and `server-rate-limit.ts`.
- `src/matchmaker.ts` — `Matchmaker` DO. Thin transport layer for lobby management, game creation, and the matchmaking WebSocket: handlers parse/validate the request, call one `LobbyStore` method, and broadcast/respond. No Drizzle chains or raw SQL live here.
- `src/lobby-store.ts` — `LobbyStore`, single owner of all Lobby state in the Matchmaker DO's SQL storage (constructed with the Drizzle `durable-sqlite` handle; tables in `src/matchmaker-schema.ts`). Owns schema creation (`migrate`), membership (`createPrivateLobby`, `joinByInviteCode`, `isMember`, `removePlayer` with host transfer), per-player state (`setTribe` — resets readiness, `setReady`, `setSlotBot`), `configure`, `getLobbyState`, `joinPublicQueue`, and the start-lobby read path (`readStartContext`). Mutations return typed outcome unions (e.g. `'ok' | 'tribe-taken'`) that handlers map to wire errors. Abuse limits live here too: `lobbyConfigBounds` (player-count and turn-timer ranges, encoded in `lobbyConfigSchema`, enforced by `parseLobbyConfig` and re-checked on every `configure` merge), `maxLobbiesPerHost` (`createPrivateLobby` returns `'limit-reached'`, mapped to 429), and `lobbyTtlSeconds` with `deleteExpiredLobbies` (swept by the create/queue handlers — the backstop for lobbies whose host never opened a WebSocket). `listPlayers(lobbyId, kind)` is the one kind-aware listing path: `publicQueue` lobbies are humans-only (bot rows excluded everywhere); `private` lobbies list bots as real slots — don't re-implement that filter.
- `src/match.ts` — `Match` DO. Wraps `createMatchLogic` from `@hexwardens/game-logic/match/logic`. RPC `init(config, idempotencyKey)`, WebSocket `fetch` / `webSocketMessage` / `webSocketClose` / `webSocketError` / `alarm`.
- `src/match-initializer.ts` — matchmaker-side implementation of the `MatchInitializer` port, calling the Match DO's `init` RPC with an idempotency key.
- `src/auth.ts` — `verifyGameToken(token, secret)` against the `Redacted` secret from `config.ts` (`loadEnvConfig(env).authJwtSecret`). Tokens are minted by `apps/web/src/lib/game-token.server.ts`.
- `src/cosmetics.ts` — `Cosmetics` Effect service. Pure-data catalog (`cosmeticCatalog`) plus an evaluator that derives unlock eligibility from `player_match_results` (bots excluded). Persists only equipped cosmetics (`cosmetic_equips`) and acknowledged unlocks (`cosmetic_acknowledgements`). **Profile-only — these structures must never reach `dispatch()`, combat, or fog-of-war**; the PRD prohibits gameplay effects.
- `src/ws-connection.ts` — connection-lifecycle module both DOs delegate to. `createConnectionLifecycle({ isMetadata, acceptSocket, presenceIncrement, presenceDecrement })` is generic over per-DO metadata (`MatchConnectionMetadata` with `tribe`, `MatchmakerConnectionMetadata` with `lobbyId` — guards live here too) and owns: `accept` (register for hibernation + `serializeAttachment` + presence increment), `read` (validated metadata, `null` on malformed attachments), `send` (per-socket sequence-numbered `encodeServerWireFrame`), and `release` (idempotent-by-construction presence release — see invariant 8). DOs construct one lifecycle in their constructor and their `webSocketMessage`/`webSocketClose`/`webSocketError` handlers are thin read-metadata→route delegations.
- `src/ws-utils.ts` — `jsonResponse` / `jsonError` helpers for DO REST responses (WebSocket send lives in `ws-connection.ts`).
- `@hexwardens/db` — shared drizzle schema + migrations for D1 (`match_results`, `player_match_results`, and the better-auth tables consumed by `apps/web`). Leaderboard/profile/history views derive all aggregates from `player_match_results`; there is no separate pre-aggregated stats table. Migrations live in `packages/db/migrations` and are applied by Alchemy's D1 resource on deploy — there is no `migrations/` folder in this app.

## Key invariants

1. **Match init idempotency.** `Match.init(config, idempotencyKey)` uses the key as match id; replays return `{ ok: true, status: 'already_initialized', matchId: <existing> }`. Matchmaker must supply a stable key — a fresh UUID each retry creates ghost matches. The key is `startIdempotencyKey(lobbyId, createdAt)` (`lobby-store.ts`): `createdAt` pins the key to the lobby _instance_, so every start retry from the same lobby collapses onto the same Match DO while a recreated lobby id gets a fresh key.
2. **Lobby readiness is first-class.** `computeLobbyReadiness` (`lobby-store.ts`) is the only encoding of the start rules — lobby exists, host-only start for private lobbies (skipped for `publicQueue` and system-driven starts), every human ready with a tribe (the `(is_ready = 0 OR tribe IS NULL)` predicate), config parses. It returns `{ canStart, blockingReasons }`; `startLobby` consumes it via `readStartContext` and maps the first blocking reason to the user-facing message. Don't duplicate these checks in handlers.
3. **Local match persistence precedes acknowledgment.** `createMatchLogic` uses the shared pure `step` reducer and awaits one `MatchPersistence.saveState` operation before broadcasts or success replies. Save failure retains the previous state, discards candidate effects and rejects client submissions so optimism rolls back; `onPersistenceError` records the failure. D1 result writes and daily-completion upserts remain asynchronous, with idempotent transient retries through `persistenceRetryPolicy`. Their failure does not roll back an already committed local match.
4. **WebSocket hibernation safety.** The DOs use `ctx.acceptWebSocket(server)` (native hibernation) via `ws-connection.ts::accept`. Attachments (`serializeAttachment`/`deserializeAttachment`) are the **only** durable per-socket state — metadata (`playerId`, `username`, `tribe`/`lobbyId`) and the `presenceCounted` flag live there, never in in-memory maps, so they survive hibernation. The per-socket send sequence is deliberately in-memory (a `WeakMap` inside the lifecycle) and **restarts at 1 after a hibernation wake**; clients treat sequences as per-connection-epoch, not globally monotonic.
5. **Auth is required for every upgrade.** Missing or invalid `?token=` returns 401/403 before the WebSocket is accepted. Never short-circuit this for "debug".
6. **Broadcast is tribe-aware.** `sendToTribe(tribe, msg)` is the normal path for fog-filtered state. `broadcastAll` is for non-secret events (game end, turn timer). Don't send raw `GameState` via `broadcastAll` — it leaks opponent units.
7. **CORS lives at the worker edge.** `ALLOWED_ORIGIN` is a comma-separated allowlist (or `*` for local dev only). The worker entry rejects cross-origin requests outside the list with 403 — REST routes, OPTIONS preflights, and WebSocket upgrades alike. DOs must not add `Access-Control-Allow-Origin` themselves. Deploys enforce the "local dev only" rule mechanically: `alchemy.run.ts` throws on wildcard or plain-http entries (localhost excepted), so a debugging `*` can never reach production.
8. **Connection release is idempotent by construction.** `webSocketClose` and `webSocketError` can both fire for the same socket; both funnel into `ws-connection.ts::release`, which flips `presenceCounted` on the durable attachment **before** queueing the async presence decrement and reports `released: true` only on the first call (even across a hibernation wake, since the flag is on the attachment). Disconnect side effects (`onPlayerDisconnected`, lobby `removePlayer`) run only when `released` is `true`. Never call `presenceDecrement` (`presence.ts`) from a WebSocket handler directly — the flag-flip-then-decrement ordering is the module's job, not caller knowledge.

## Usage Patterns

```ts
// Cloudflare port bindings pass game-logic a uniform interface
this.logic = createMatchLogic({
  persistence: this.createPersistence(),   // ctx.storage.kv + D1
  broadcast:   this.createBroadcast(),     // ctx.getWebSockets()
  scheduler:   this.createScheduler(),     // ctx.storage.setAlarm
  clock:       { now: () => Date.now() },
  codec:       createCodec(),
  log:         (event, data) => { ... wide event ... },
  onPersistenceError: (err) => { ... wide event with error ... },
})
```

## Wide events

Logging goes through Effect's `Logger` via `src/wide-event.ts` — one structured JSON wide event per request / lifecycle moment, written to the Workers Logs console stream by `wideEventLoggerLayer`. Request-scoped handlers use `createRequestWideEvent(request)` (seeds `http.method` / `http.path`); DO internals (no `Request` in scope — e.g. WS message handling, `step` log effects) use `createWideEvent()`. Accumulate context with `log.set(...)` (deep-merges nested records), attach failures with `log.error(...)`, and `log.emit(...)` exactly once at completion. `emit` is the run boundary for the imperative DO handlers; Effect-native code can `Effect.log({...})` against the layer directly. Canonical events the server emits:

- **Lobby:** `lobby_created`, `player_joined_lobby`, `lobby_ws_rejected`, `lobby_ws_error`.
- **Match lifecycle:** `game_starting` / `game_start_replay` (matchmaker), `game_initialized` / `turn_advanced` / `game_ended` / `player_forfeited` (emitted by game-logic via `log` effect), `match_ws_rejected`, `match_ws_error`.
- **Auth:** `auth_failed` with `route` ∈ {`lobby_create`, `lobby_join`, `lobby_ws`, `match_ws`} and `reason` ∈ {`missing_token`, `invalid_token`}.
- **Abuse:** `http_rate_limited` with `reason` ∈ {`lobby_create`, `lobby_join`, `public_queue`, `lobby_ws`, `match_ws`} (the `HttpRateLimitScope`), emitted at the worker edge with status 429.
- **Persistence:** `persistence_error` / `persistence_failure` on saveState / saveMatchResult failures (after `persistenceRetryPolicy` is exhausted).
- **Config:** `config_invalid` when env validation fails at the worker edge.

Keep field names in parity with web (`match.id`, `lobby.id`, `player.id`, `player.username`, `player.tribe`) so dashboards can aggregate across both surfaces.

**Span timings.** `spanRecordingTracer(sink)` / `withSpanRecording(sink)` (also in `src/wide-event.ts`) fold every finished Effect span (`Effect.withSpan`, `Effect.fn`, the db `query()` wrapper) into the wide event as `spans.<name> = { ms, count }` (cumulative per name; `failed` added when any failed). Wired in three places: the per-request HttpApi handler (`request-handler.ts` provides a request-scoped `Tracer` layer, so `db.*` timings land on the API request's wide event), and the achievements / daily-completion persistence flows in `match.ts` (spans land on the failure events). Pipe `withSpanRecording(log)` at any new `Effect.runPromise` boundary that already owns a wide event.

## Anti-patterns

- Keep gameplay in `@hexwardens/game-logic`. `match/step.ts` routes commands and `match/transitions.ts` derives state changes. `match/logic.ts` owns runtime persistence, scheduler/backoff, pump and abort-controller cancellation; adapters translate I/O.
- Don't `JSON.parse` incoming WebSocket messages in the DO. The codec is the schema-validated entry — `logic.onRawMessage(...)` handles decoding.
- Keep match-result writes outside pure `step`. After local commitment, `publishMatchTransition` routes `gameEnded` to async `MatchHost.endGame`, with failures reported via `onPersistenceError`.
- Don't skip the tribe check in `fetch`. `state.playerIdToTribe[payload.userId]` returning undefined means the player isn't in this match — reject with 403 rather than attaching them to an arbitrary tribe.

## Dependencies & Edges

- Imports from: `@hexwardens/game-logic` (match/logic, match/codec, match/ports, match/types, domains/tribe), `@hexwardens/db` (drizzle schema + `createDb(env.DB)`), `drizzle-orm`, `effect`, `cloudflare:workers`.
- Bound to: D1 (`env.DB` — queried via drizzle; shared with `apps/web`'s better-auth), Durable Object storage (Drizzle `durable-sqlite` for matchmaker lobby SQL, KV + alarms for match state), JWT secret (`env.AUTH_JWT_SECRET`, read only through `config.ts`).
- IaC: Alchemy v2 in `alchemy.run.ts` at the repo root provisions the Worker, DO namespaces, redacted `AUTH_JWT_SECRET`, and the shared D1 (`hexwardens-db`).

## Patterns & Pitfalls

- The `Match` DO reloads through `checkpoint.ts` at construction, validating data and converting legacy native snapshots. Optional `execution` records only `bot-running` or `cleanup-pending`. Interrupted bots restart from the committed turn boundary; absolute deadlines survive restoration. Local persistence recovery uses exponential delays capped at 30 seconds without a finite attempt budget. A failed deletion retains `cleanup-pending` and retries after reload. Return/await initialization and raw-message promises so Cloudflare owns their asynchronous work.
- `writeMatchResult` uses drizzle's `db.batch([...])` (D1 atomic batch) so the match row + all player-match rows insert atomically. Every insert uses `onConflictDoNothing` on its primary key so replays of the same `matchId` are safe — never weaken this or the leaderboard over-counts on retry. Leaderboard/profile/history reads go through drizzle's query builder; raw `env.DB.prepare` is no longer used here.
- `LeaderboardLive` is an Effect layer that depends on `@hexwardens/db`'s `Database` service. Provide D1 once at the Worker/test boundary; callers should yield `Leaderboard` and call its methods without carrying a separate `Database` requirement.
- Await `onConnectionOpened` before accepting a WebSocket. It clears disconnect grace and increments the connection count in one commit; failure returns HTTP 503. Close/error callbacks return the disconnect receipt promise so failed lifecycle writes remain owned by the active host until retry commits them.

## Testing

- `src/test/d1-fixture.ts` exposes `createD1Fixture()` — a Miniflare-backed (workerd in-process) D1 binding with migrations from `packages/db/migrations` applied. Tests get one `db` (drizzle) + one `d1` (raw binding) handle against the same real D1; `countRows(table)` / `selectAll(table)` are typed inspection helpers keyed by `@hexwardens/db/schema`. No better-sqlite3 shim — `batch()` runs through actual D1, so atomicity and bind-type coercion match production.
- Each fixture spins a fresh in-memory D1 per `beforeEach`; `await fixture.close()` disposes the Miniflare instance in `afterEach`. Expect ~300–600ms overhead on the first fixture in a file and <50ms per subsequent one.
- `lobby-store.test.ts` tests `LobbyStore` against `drizzle(':memory:')` from `drizzle-orm/node-sqlite` (Node's built-in SQLite — no Miniflare needed). This works because `LobbyStore` accepts any synchronous Drizzle SQLite handle (`LobbyDb`), of which the production `durable-sqlite` handle is one. `store.migrate()` creates the same tables the DO creates; readiness (`computeLobbyReadiness`) and `startIdempotencyKey` are pure and tested directly.
- `ws-connection.test.ts` tests the connection lifecycle with plain fake sockets (no Miniflare) — the module is generic over a structural `ConnectionSocket`, so a class with `readyState`/`send`/`serializeAttachment`/`deserializeAttachment` (round-tripping through `structuredClone`) stands in for Cloudflare's `WebSocket`. Covered: metadata roundtrip + malformed-attachment rejection for both DO shapes, per-socket sequence numbering (and its restart on a fresh lifecycle instance, mirroring hibernation wake), and release idempotency (close+error → exactly one decrement, including across instances).

## Request security

`request-handler.ts` applies the native `GAME_RATE_LIMITER` before API and WebSocket routing, except health checks and CORS preflights. Missing or failed bindings refuse public requests; local fallback requires both loopback request and local provider-configured origins. Scoped in-memory limits remain additive, and both limiters trust only `CF-Connecting-IP`. HTTP responses are private/no-store and nosniff; native 101 responses retain their WebSocket handle. CORS wrapping preserves existing `Vary` dimensions. Error logs omit arbitrary exception messages, stacks and causes. Game JWTs require exactly three base64url segments and the supported HS256/JWT header; malformed input remains a typed refusal.

The scoped development bypass is decided by `rateLimitScopeForRequest` using both the request host and every configured allowed origin, independently of native binding availability. A public request with `HEXWARDENS_DISABLE_RATE_LIMIT=1` and a healthy native binding still hits the lobby/queue scoped limits. Loopback requests with local-only configuration (including the explicit local `*` setting) may bypass scoped buckets; native refusals remain authoritative.

Lobby configuration enforces `board/map-capacity.ts` limits and cannot shrink below occupied seats. Bot creation and human joins both respect total seat capacity.
