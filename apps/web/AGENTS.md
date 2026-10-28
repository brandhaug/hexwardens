# apps/web

## Purpose & Scope

TanStack Start web application — SSR, file-based routes, the game UI, the lobby, the multiplayer client, and the wiki. Hosts both the **online** multiplayer game (`/multiplayer-game`) and a fully-playable **offline** single-player mode (`/game`) that drives `@hexwardens/game-logic` directly. Owns rendering, input, audio, asset loading, and auth client.

## Routes (`src/routes/`)

- `/` (`index.tsx`) — landing.
- `/game` (`game.tsx`) runs production single-player through `createOfflineMatch(...)` and the same `MatchLogic` and pure `step` reducer as the server. `match/logic.ts` owns scheduling, persistence and bot cancellation. `useOfflineMatch` awaits `match.ready()` before exposing the handle. The offline persistence adapter wraps browser `commitLocally` and awaits IndexedDB transaction completion before publication; a timer scheduler drives bots with the injected `BotPacer`. React reads committed snapshots through `useSyncExternalStore`; viewer projection uses `match.snapshotFor(tribe)`. Search params remain zod-validated. Treat UX regressions here as ship-blocking.
- `/lobby` (`lobby.tsx`) — pre-match setup over WebSocket to the matchmaker DO.
  Create/join/queue requests share a synchronous in-flight guard so effect replay cannot create duplicate lobbies or sockets. Async responses must check that the route is still mounted before opening a connection; unmount disconnects the owned client.
- `/multiplayer-game` (`multiplayer-game.tsx`) — online match. All `GameState` flows through WebSocket → `GameClient` → the multiplayer `MatchClient` adapter → React. Never re-computes fog.
- `/wiki`, `/wiki/$category/$slug` — MDX-backed content from `content/`.
- `/api/auth/$` — Better Auth handler.
- `__root.tsx` — provider tree (TanStack Query, devtools, sonner toast).
- `routeTree.gen.ts` — **generated**, do not edit.

## Entry Points & Contracts

- `src/lib/match-client.ts` owns the shared match interface. `getGameState` / `subscribe` expose stable snapshots; `canAct` gates input. `submitIntent` returns `IntentSubmission | Promise<IntentSubmission>` and `endTurn` returns `void | Promise<void>`. Input handlers must await completion before reporting acceptance. Eager commitment and no in-turn undo remain per [ADR-0010](../../docs/adr/0010-eager-action-commitment-no-in-turn-undo.md), with local durability clarified by [ADR-0011](../../docs/adr/0011-normalized-engine-and-durable-xstate-matches.md). `subscribeBroadcastEvents` supplies audio and animation events. Adapters:
  - `src/lib/offline-match-client.ts` shares one input lock across intents and end-turn submissions, releasing it after success or failure. It awaits `OfflineMatchHandle.send` and captures the post-commit `actionResult`. A missing reply means failure, never acceptance. Offline rendering observes committed state without an optimistic overlay.
  - `src/lib/multiplayer-match-client.ts` — wraps a narrow `MultiplayerTransport` slice of the WebSocket `GameClient` and owns the **optimistic-apply overlay**: `submitIntent` runs `executeCommittedIntent` locally over the server-projected `FilteredGameState` (never re-derives fog), eager-sends, and holds a single-flight lock (`canAct() === false`) until the server's next `gameState` push (ack) or `actionResult` rejection (rollback). The route's `ServerMessageHandlers` feed it via `receiveGameState` / `receiveActionResult` / `receiveTurnEvents`; connection lifecycle, timers, chronicle, and toasts stay in the route.

  Routes construct their adapter and pass it to `useMatchInputs` and the `src/hooks/use-match-client.ts` bindings (`useMatchClientGameState`, `useMatchClientCanAct`, `useMatchBroadcastEvents`). Adapter conformance is pinned by `offline-match-client.test.ts` (drives a real offline match) and `multiplayer-match-client.test.ts` (fake transport, real fog projections).

  Persistence failures retain committed state. Offline submissions report failure after the awaited transaction; multiplayer `actionResult` rejection clears its optimistic overlay and input lock. Restored bots restart from the committed turn boundary. Persist independent `execution` markers with `gameState`. New saves use `normalized-match-v4`; preceding `normalized-xstate-v3` checkpoints convert on load, while pre-normalized saves remain incompatible.

- `src/lib/saved-match/saved-match-lifecycle.ts` owns [ADR-0009](../../docs/adr/0009-offline-first-saved-match-sync.md)'s rules. `createSavedMatchLifecycle({ store, remote })` loads local and remote revisions in parallel and returns `empty | ready | conflict | incompatible`. `resolveConflict` rebases the player's selected revision. `beginSession` exposes an awaited local write used by `commitLocally` before gameplay publication; IndexedDB writes resolve on transaction completion, not request success. Remote replication stays debounced at 750 ms with revision checks and `onRemoteConflict` for rejection. `acknowledgeDeleted` flushes pending writes before tombstoning to prevent resurrection by another device. The React bindings are `useBrowserSavedMatchLifecycle`, `useSavedMatchGate` and `useSavedMatchSession`, including pagehide/unmount flush. Routes use these bindings rather than importing merge rules, store adapters or server functions directly. `SavedMatchStore` remains platform-neutral. Remote sync is logged-in-only; guests retain local durability. Version compatibility is defined by `match/saved-match.ts`. `saved-match-lifecycle.test.ts` pins divergence rules with fake local and revision-checked remote stores.
- `src/lib/game-client.ts` — `createGameClient(handlers)`. Deep transport module for lobby/match WebSockets: owns connection state (`idle` / `connecting` / `open` / `reconnecting` / `closed`), queued sends, reconnect, server-frame envelope decoding, decode diagnostics, and last-seen server sequence metadata. `handlers: ServerMessageHandlers` is a **mapped type** over every `ServerMessage['type']`. Missing a variant is a compile error — this is the enforcement mechanism that keeps the client in sync with `packages/game-logic/src/multiplayer/types.ts`.
- `src/lib/game-connection-status.ts` — pure presentation mapping for multiplayer recovery states. Routes render this instead of spelling status copy inline.
- `src/lib/audio/audio-manager.ts` — `AudioManager` class with the four buses (`master`, `music`, `fx`, `announcer`), lazily-built `AudioContext`, and a small public surface (`playSfx`, `playStinger`, `startMusic`, `stopMusic`, `setVolumes`, `setMuted`, `dispose`). `src/lib/audio/audio-events.ts` is the single mapping from `GameAudioEvent` (broadcast events + state diffs) to `(bus, sound)`. `src/hooks/use-game-audio.ts` is the only place that turns gameplay events into audio calls — UI components must not call `playSfx` for combat / capture / research / level-up cues. Pure-UI affordances (selection, end-turn confirmation) still go through `src/lib/audio.ts#playSound` (a thin shim over the manager).
- `src/lib/server-context.ts` — `createServerContext(request)`. Single per-request factory that lazily wires the drizzle DB and the game-token signer. Server handlers construct one per request; never call `createDb` directly.
- `src/lib/auth-client.ts` / `auth.server.ts` — Better Auth client + the `effectful-better-auth` service. `auth.server.ts` exports `Auth` (`{ Tag, layer }` from `service('web/Auth', authOptions)`), the derived `Session` type, and the session-bound effects `currentSession` / `mintGameToken`. `Auth.layer` has no requirements (the options builder reads isolate-scoped `env` bindings and `createDb(env.DB)` inside a deferred Effect) and is memoized per isolate by `auth-runtime.ts`'s `authRuntime` (`ManagedRuntime.make`) — one better-auth instance per isolate, so the scoped in-memory `rateLimit` counters accumulate across requests. `auth-config.ts` validates its secret and explicit secure origins before initialization. Handlers never provide `Auth.layer` themselves; `runWithServerContext` runs on `authRuntime`. `auth.api.*` through the Tag is the effectful proxy with tagged `BetterAuthApiError` failures; `auth.instance` is the raw Better Auth escape hatch for `asResponse` / `handler`. Sessions are stored in the shared Cloudflare D1 via `@hexwardens/db`.
- `src/routes/api.auth.$.ts` — mounts Better Auth via `toHttpEffect(Auth.Tag)` run on the per-isolate `authRuntime`; only the request (`HttpServerRequest.fromWeb`) is provided per call, the Auth service comes from the runtime's memoized layer.
- `src/lib/game-token.server.ts` / `game.functions.ts` — server-side HS256 JWT minted via the `mintGameToken` effect in `auth.server.ts` (auto user-vs-guest), carried as `?token=` on the WebSocket upgrade to the match DO. `createTokenSigner(secret)` is internal; the `CryptoKey` import is cached module-wide by secret.
- `src/lib/server-rate-limit.ts` — fixed-window, IP-keyed (`CF-Connecting-IP`) limiter for server functions; callers pass scope + rule inline (`getGameToken` → 429 via a `httpApiStatus`-tagged error, `reportClientError` → drops the log payload). Same best-effort, per-isolate semantics as the game-server's `src/http-rate-limit.ts` — keep the two in sync when changing either. `HEXWARDENS_DISABLE_RATE_LIMIT=1` bypasses it only when both the request host and configured auth URL/trusted origins are loopback; `process.env` is also available in production Workers with Node compatibility and is not an environment boundary.
- `src/lib/server-context.ts#runWithServerContext` — the Effect runner for server functions. Handlers stay plain `createServerFn(...)` and call `runWithServerContext(getRequest(), effect)`, which runs on the per-isolate `authRuntime` (satisfying `Auth.Tag` from the memoized instance), provides a per-request `ServerContextTag` (backed by `createServerContext`), emits one `server_fn` wide event per run via `wide-event-logger.ts`, and returns the resolved value as a Promise. Used by `game.functions.ts`, `auth.functions.ts`, and `saved-match/saved-match.functions.ts` for session-bound work (auth, game-token minting, saved-match sync). General REST data fetching does **not** go through server functions — it hits `apps/game-server`'s HttpApi directly via AtomHttpApi atoms (`api-client.ts`).
- `src/start.ts` owns request security: explicit server-function CSRF middleware, private response headers, and the native `WEB_RATE_LIMITER` gate for server functions and auth HTTP routes. Form actions delegate to Better Auth's HTTP handler to retain its origin checks and credential throttle. Bindings fail closed outside local development; scoped memory counters remain a second brake.
- `src/server.ts` — Worker entry. Re-exports `@tanstack/react-start/server-entry`; logging lives in `src/lib/wide-event-logger.ts` and is provided per request by `runWithServerContext`. Alchemy v2 deploys the app through `Cloudflare.Website.Vite`, which invokes Vite with the Cloudflare plugin instead of a hand-written Worker `main`.

## Key invariants

1. **Fog is server-trusted.** All `GameState` received via WebSocket is already a `FilteredGameState`. The web never re-projects (`snapshotFor(...).projected`) or filters opponent data — do it server-side or in the offline path. Trying to "re-derive fog for safety" will double-filter and break tooltips.
2. **`ServerMessageHandlers` exhaustiveness.** If TypeScript errors on an added wire message, the fix is to _handle the new message_, not to loosen the type.
3. **Multiplayer transport stays behind `GameClient`.** Routes may subscribe to `GameConnectionStatus`, but they must not decode wire envelopes, manage sequence numbers, or reach for raw WebSocket events directly.
   `onClose` reports unexpected loss of an open socket. Intentional `disconnect()` publishes closed status without firing this callback, so route cleanup and leaving a match stay quiet.
4. **Route tree is generated.** Never edit `routeTree.gen.ts`. Adding a route = add a file under `routes/` and let the generator run.
5. **Per-request wiring lives behind `createServerContext(request)`; the auth instance is per-isolate.** Server handlers reach for `ctx.db()` / `ctx.mintUserToken()` / `ctx.mintGuestToken()` via `ServerContextTag`, and session work goes through `currentSession` / `mintGameToken` — `runWithServerContext` satisfies `Auth.Tag` from the per-isolate `authRuntime`. The split matters: request-bound I/O objects (the `Request`, its headers) stay per-request behind `ServerContextTag`, while the better-auth instance must **not** be rebuilt per request — its in-memory `rateLimit` counters only throttle if the instance survives across requests (`env` bindings are isolate-scoped and safe to share; CF's "Cannot perform I/O on behalf of a different request" concerns request-bound I/O objects, not bindings). Laziness is still required at import time: nothing touches `env` until `createServerContext`'s first accessor is called or `authRuntime` first builds its context — never call `createDb(env.DB)` / `createTokenSigner` / `betterAuth(...)` at module scope.

## Usage Patterns

```tsx
// Multiplayer message handling — compile-enforced exhaustive
const client = createGameClient({
	handlers: {
		gameState: (msg) => setState(msg.state),
		actionResult: (msg) => toast(msg.message),
		turnTimerUpdate: (msg) => setTimer(msg.turnEndsAt),
		gameEnd: (msg) => navigate({ to: '/lobby' }),
		error: (msg) => toast.error(msg.message)
		// every variant required
	},
	onStatusChange: setConnectionStatus
})
```

## Anti-patterns

- Don't call `editPlayer` or the Action Engine (`planAction` / `executePlan`) directly from components. Route through `dispatch()` so game-over / turn / fog invariants fire.
- Don't store server-trusted `FilteredGameState` through a transformer that "enriches" it with opponent data. The shape is the contract.

## Visual Registry & Mesh Assets

Tile Items, Units, Heroes, and the target terrain renderer use the **Visual Registry** — a per-category lookup mapping each entity to a render directive. See [ADR-0005](../../docs/adr/0005-adopt-glb-mesh-assets-from-poly-pizza.md) for the old Poly Pizza story and [ADR-0006](../../docs/adr/0006-adopt-kaykit-asset-suite-and-animations.md) for the KayKit replacement pipeline.

GLB assets are committed at:

```
apps/web/public/models/
├── villages/{village,capital}.glb
├── units/<unit-type>.glb
├── heroes/<hero-type>.glb
├── buildings/{primary,secondary,utility}/<value>.glb
├── resources/<resource>.glb
├── terrain/<terrain-or-variant>.glb
└── decorations/<decoration>.glb
```

File names match the entity identifier in `@hexwardens/game-logic/domains/*` (kebab-case).

Each per-category file (`village-visual-registry.ts`, `unit-visual-registry.tsx`, `hero-visual-registry.ts`, `building-visual-registry.ts`, `resource-visual-registry.tsx`, `ruins-visual-registry.ts`) exports a `Record<EntityKey, VisualRegistryEntry>` — the discriminated union of `'mesh'` and `'procedural'` entries. Adding a new entity to the game-logic domain without registering its visual is a compile error — same pattern as today's `tribeToMaterialColor`.

**`getVisualEntry(...)` in `board-visual-registry.ts` is the single visual-routing seam.** Render sites (`tile-item-miniature.tsx`, `unit-miniature.tsx`, `landing-hero-showcase.tsx`) pass a domain entity — a `TileItem` (Village / Building / Resource / Ruins, routed on its own `type` discriminant), `{ type: 'unit', unit, terrain }`, or `{ type: 'hero', heroType }` — and get back a discriminated `VisualResolution`: the registry entry plus the derived render facts (`groupScale` / `meshScale`, the water-terrain → ship fallback, hero-vs-general registry selection, the hero scale boost, and the tribe `tintColor` for general-unit meshes). Render sites own only the mesh-vs-procedural JSX; do **not** index a per-category registry or re-derive fallback/scale/tint logic at a render site — add it to the dispatcher (or the category's `resolve*Visual` helper it delegates to). Terrain (`terrain-visual-registry.ts`) and obstacles (`obstacle-visual-registry.ts`) are separate seams owned by the board renderer. Dispatcher routing is pinned by `board-visual-registry.test.ts`.

**When adding a new KayKit mesh entry:**

1. Source from the local KayKit catalogue under `~/kaykit/`. KayKit assets are CC0, so registry entries may omit `attribution`.
2. Convert `.gltf` + `.bin` pairs with `node tools/convert-kaykit-asset.ts <source.gltf> <target.glb>`. Existing KayKit `.glb` sources may be copied through the same tool.
3. Verify category triangle caps with `node tools/check-tri-counts.ts`: resources <=1500, units <=10000, buildings/villages <=7500, heroes <=15000, terrain <=100, decorations <=1500.
4. Commit the GLB at `apps/web/public/models/<category>/<name>.glb`.
5. Add the entry to the matching per-category registry file. Character entries that use KayKit animations set `rig: 'Rig_Medium' | 'Rig_Large'`; static meshes leave `rig` unset.
6. The `/credits` route renders attribution from the registry. KayKit should appear as one consolidated CC0 credit block, not one line per mesh.

**Failure mode.** If a GLB fails to load, the Suspense boundary surfaces a deliberate error UI. Do not add silent fallback to procedural — that masks regressions.

**Animation.** KayKit character entries use the optional `rig` field in `MeshAssetEntry`. `animation-clips.ts` maps each rig to local KayKit animation-library GLBs and idle / walk / attack / death clip names. `unit-miniature.tsx` drives a Three.js `AnimationMixer` for rigged character animation while keeping position interpolation in `unit-move-tween.ts`; static entries such as cannon do not enter the animated path. Keep one mixer per cloned root and crossfade clip changes; complete one-shots within the board override window. Movement starts from the displayed position so interrupted moves remain continuous. Reduced motion snaps movement to its destination and shows static combat poses while retaining health/callout feedback.

**Resources.** The resource registry owns patch placements as well as mesh/procedural selection; consume both through `getVisualEntry`. Land resources rest on the tile. Wheat, fish, pearls, and clay use authored procedural models. Collection ghosts come from visible resource-to-empty transitions in `resource-harvest-transitions.ts`; fog loss and replacements are not collection. Hide active ghosts when the current tile is fogged or restored by rollback, and suppress their spatial animation under reduced motion.

Combat clip lengths and override windows share `unit-animation-timing.ts`. The defeat shrink applies only to the miniature, after its fall has started; reduced motion retains a static pose. Use the `Game/Combat clips` story to replay attack, defence, and defeat together.

**Initial camera.** Frame the viewer's capital, another owned village, or a friendly unit before falling back to visible terrain. Keep that target stable after mount; exploration must not recenter the board. Reveal-all stories retain the full-board framing.

**Board rendering budget.** Narrow viewports cap DPR and shadow resolution in `board-scene.tsx`. Recreate the shadow-casting light when its resolution changes: changing `shadow.mapSize` alone does not resize an allocated render target. Verify mobile-to-desktop resizing as well as initial loads.

**Tribe variants.** General Units share a single mesh per type and tint at render time via the entry's `tintMaterial` lookup. Heroes have a unique mesh per Tribe (one of the 9 entries in `hero-visual-registry.ts`).

## Dependencies & Edges

- Imports from: `@hexwardens/game-logic` (deep subpaths), `@hexwardens/db` (schema + D1 client factory), `@base-ui/react`, `@tanstack/*`, `honeycomb-grid`, `@react-three/fiber`, `@react-three/drei`, `three`, `sonner`, `better-auth`.
- Path alias: `@/*` → `apps/web/src/*`.
- DB: Cloudflare D1 (`hexwardens-db`), shared with `apps/game-server`. Schema and migrations live in `packages/db`. Server code reads `env.DB` via `import { env } from 'cloudflare:workers'`, never `process.env`.
- Deploy: Alchemy v2 `Cloudflare.Website.Vite` resource in `alchemy.run.ts`. Alchemy injects the Cloudflare Vite plugin for deploy/dev; standalone `vite build` and `dev:web` opt into `HEXWARDENS_USE_WORKERS_SHIM=1` so local non-Cloudflare runs do not require real bindings.

## Patterns & Pitfalls

- The `/game` route takes bot opponents inline via zod-validated search params. If you change defaults (`numberOfOpponents`, `difficulty`, etc.), update shareable links and the lobby pre-fill.
- `handleTileSelection()` from `@hexwardens/game-logic/tile/tile-selection` owns shift/ctrl click semantics — the UI wires key state in, not the other way around.
- The web imports honeycomb-grid directly _only_ for rendering (sprite positioning). All gameplay hex math goes through `Board`.
- Annotate domain errors with `httpApiStatus` (`Schema.TaggedErrorClass(..., { httpApiStatus: 502 })`) so the client side of a server-fn rejection has a meaningful status — see `game-server-error.ts` for the upstream-fetch pattern.

## Security boundaries

Keep auth, signing, binding access and server runtime modules behind the `@tanstack/react-start/server-only` marker. Error logs retain request context and failure names; exception messages, stacks, causes and submitted browser URLs can contain credentials and stay out of logs. Completion logging must cover defects as well as typed failures. Review [the application security audit](../../docs/audits/application-security-upgrades.md) when changing auth configuration, rate limits or request middleware.

Authentication forms forward the current request context to Better Auth's HTTP handler so its origin, session and rate-limit policies run. Server-only modules use TanStack Start's server-only boundary. `WEB_RATE_LIMITER` protects public requests and fails closed on missing or failed bindings outside verified local development; the stricter per-isolate buckets remain supplemental. Never trust forwarded-IP headers as Cloudflare identity.

## Request-owned auth diagnostics

`wide-event-logger.ts#runWithRequestWideEvent` owns logging around the runtime call, including lazy Auth initialization. Server functions use it through `runWithServerContext`; native `/api/auth/$` GET/POST use it directly and record response status under `http.status`. Each execution emits one completion, preserving failures and recording bounded auth route identities or query-free paths for other routes. `AsyncLocalStorage` isolates provider metadata; the Effect tracer context restores it on every primitive so shared scheduler callbacks cannot mix requests. Await request work before completion; late callbacks in a completed context do not emit detached request logs.

Better Auth diagnostics accumulate only count and highest severity on `auth_provider` in the owning completion. Provider messages/arguments never enter the store. Provider errors upgrade completion severity even if the operation returns successfully; `outcome` still describes the actual result. A callback with no request context emits an explicitly named `auth_provider_init` lifecycle diagnostic. Keep runtime initialization inside the request owner and do not call the auth runtime directly from request handlers.

Auth request logs use the bounded `/api/auth/$` identifier through `requestLogPath`, including native-limit rejection events. Never log auth callback path segments: Better Auth reset links can carry credentials in the path, not just the query. Unknown and encoded auth suffixes must be bounded too; retain method, status, outcome and provider severity/count without endpoint payloads.

End-turn confirmation belongs to `useMatchInputs`, shared by Space and both responsive buttons. Buttons display its armed state and call the shared handler; do not add local confirmation hooks. Turn/viewer changes clear confirmation. Global shortcuts ignore repeat events, open dialogs, and focused interactive controls.

Confirmation is an optional device preference, enabled by default. Ready-unit counts and Next Unit use the same cycler candidates, excluding units passed in the UI; turn and viewer changes reset those passes.

The research panel receives the viewer's owned-village count from `findVillagesByTribe`; prices and affordability use that count through the shared research-cost function.

`accessible-board.tsx` consumes the visual board's rendered entries and invokes the same selection, movement and attack handlers. Fog entries expose only coordinates and the unexplored label. `action-inspector.tsx` uses the shared action planner through `inspectTileActions`; denied commands show its reason and inspection never executes an action or exposes a stored ruins reward.

Onboarding keeps optional lesson progress in its existing version-one storage record. Selection and accepted movement are monotonic lessons; Replay tutorial resets them and works after the first turn. Online movement records the locally accepted gesture, including optimistic submissions. Result dialogs mount for every completed match, including draws with no winner.

Single-player setup disables incompatible map/player options using `board/map-capacity.ts`. Lobby map changes submit the corresponding seat capacity and cannot displace existing players.

New offline matches consume `fresh=true` after the save session mounts, replacing the URL so refresh resumes committed progress. Multiplayer guest game credentials survive refresh in tab-scoped session storage; the match route loads client-side so it can recover them. This storage contains the short-lived game WebSocket capability, never the account session. Storage denial retains in-memory play; malformed stored values are ignored.

Projected tiles with `terrain === null` remain fog even when optimistic movement expands local exploration. The terrain renderer must wait for the authoritative reveal before loading a mesh.

Optimistic commands use a temporary simulation board with unknown tiles absent. Missing opponent private fields get simulation-only defaults. The displayed overlay restores the original fog entries, opponent player records, and authoritative outcome. These defaults never become server data or reveal unknown terrain.

Vite+ owns development console forwarding. Keep TanStack devtools `consolePiping` disabled to prevent browser/server log feedback loops.
