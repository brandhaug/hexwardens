# Match (state machine)

## Purpose & Scope

`step.ts` routes commands to pure transformations in `transitions.ts`, returning simulation changes and `MatchEffect`s. Turn ownership and game-over come from `gameState`; `execution` stores only independent bot-running and cleanup-pending facts. Production and tests share this reducer. `logic.ts` owns runtime persistence, scheduler/backoff, pump and abort-controller cancellation through injected ports.

## Entry Points & Contracts

- `runMatchCommand(state, command, host, now)` (`host.ts`) is the synchronous compatibility wrapper around `step`, persistence and `publishMatchTransition`. Save failure returns the original state without publishing effects. `pendingBotTurns` lets callers await bot quiescence.
- `createMatchLogic(deps)` calls `step`, awaits one `MatchPersistence.saveState` operation, then replaces committed state and calls `publishMatchTransition`. All commands are serialized; queued commands use current state when they execute. Await bot completion outside the commit queue because resolution re-enters that queue.
- `onConnectionOpened(playerId)` atomically clears disconnect grace and increments connections. Await its boolean before accepting a socket. `onPlayerDisconnected` retains failed events in arrival order with their original timestamps; commands and alarms drain them before other work. Await its receipt in transport callbacks until commitment, keeping the host active during retry.
- Terminal cleanup checkpoints reject connection admission. `sealMatchOutcome` clears the turn schedule on every game-ending path. Queued alarm commands execute only against the checkpoint that selected them; after an intervening commit, the pump selects due work again.
- `step(state, command, now)` returns `{ nextState, effects, lifecycle }` without storage decoding or runtime work. Add routing here and simulation transformations to `transitions.ts`. Gameplay changes clear the old bot-running marker. `checkpoint.ts::restoreMatchState` validates and converts persisted data once at host construction.
- `pump(opts?) -> Promise<PumpResult>` drives due deadlines and bot work until external input, a caller predicate, the cap, game-over or persistence failure. `onAlarm()` wraps the bounded pump. `PumpResult.reason` is `idle | blocked-on-human | game-over | cap-exhausted | predicate-met | destroyed | persistence-failed`.
- `pickDueCommand(state, now)` / `blockedReasonFor(state)` (`pump.ts`) — pump scheduling policy. Keep deadline priority here, not in `logic.ts`.
- `wireIntentToIntent(wire)` (`wire-intent.ts`) — converts multiplayer wire coordinates into internal `Intent` board positions. Keep wire/internal coordinate translation here, not in client-message branches.
- `buildGameStateMessage(matchState, tribe)` (`view-projection.ts`) — Match view projection interface. Converts authoritative Match state into the exact filtered `{ type: 'gameState' }` server message for one Tribe, returning a typed Fog-of-War projection failure instead of logging or swallowing. `createMatchLogic` owns the logging/fan-out policy.
- `projectStateForTribes(matchState, tribes)` (`state-projection.ts`) — pure per-Tribe batch projection: de-duplicates `tribes` (first-seen order, multiple sockets can back one Tribe) and returns one `TribeProjection` per unique Tribe — `{ ok: true, message }` or `{ ok: false, error: FogProjectionError }`. **Pure data in, data out — no broadcasting, no logging.** `fogProjectionFailureLogData(tribe, error)` flattens a failure into the log-stable `{ tribe, error, message, path }` record for the `fog_projection_failed` event — keep its key set stable, log queries depend on it. `createMatchLogic`'s `projectStateToConnected` is the only fan-out policy: it ships successes via `MatchBroadcast.sendToTribe` and logs failures.
- `init(config, matchId)` is asynchronous and **idempotent**. Concurrent calls share the initial commit. Loaded state returns `{ ok: true, status: 'already_initialized', matchId }` with the existing id. State, timers and messages become observable only after commitment.
- `sealOutcome(state)` (`outcome.ts`) — pure end-game detector applied by `dispatch.ts` after every intent. See `outcome.test.ts`.
- **Ports (`ports.ts`)** — `MatchPersistence`, `MatchBroadcast`, `MatchScheduler`, `MatchClock`, `MatchCodec`, `MatchObserver`. Persistence writes return `Effect Result<void, PersistenceError>` so the adapter chooses the recovery policy. `MatchObserver` is optional — defaults to a no-op; hosts opt in to route typed lifecycle events (turn advanced, bot turn completed, game over, …) to tests, UI, or the host wide-event log.
- **`MatchInitializer` port** (`initializer.ts`) — Lobby→Match handoff with idempotency keys. `in-memory-initializer.ts` is the fake for tests.
- `createOfflineMatch(args)` supplies memory ports, in-process broadcasts, a timer scheduler and injectable `BotPacer`. Its persistence adapter wraps the browser's `commitLocally` callback. Every caller, including memory-only tests, awaits `OfflineMatchHandle.ready()` before reading state. `send` and `endTurn` return promises. `playerTribe: null` rejects gameplay with `SpectatorActionError`.

Each mounted offline handle registers one viewer before `ready()` resolves. Restoration replaces the prior host's connection count; disposal cancels scheduling and retains the save. Completed results remain available while the handle is mounted.

## Key invariants

1. **Local persistence precedes publication.** A failed local save discards the candidate and retains the last committed state. No success reply, state broadcast or lifecycle effects from that candidate may escape. Host failure feedback reports through `onPersistenceError` and sends an `actionResult` rejection for client submissions so multiplayer can roll back optimism. The pump stops with `persistence-failed`. D1 result writes and cloud replication remain asynchronous after local commitment.
2. **Init idempotency is load-bearing.** The matchmaker supplies an idempotency key, which becomes the match id. Replayed RPCs against the same Durable Object see `already_initialized` and a stable id — don't "fix" `init` to overwrite.
3. **Deadlines are absolute.** Preserve them across restoration. `pump()` uses `pickDueCommand` priority: disconnect forfeit, human turn timeout, bot turn, cleanup. Re-evaluate after each command so a forfeit that ends the game skips remaining gameplay work. Ended matches only process due cleanup with no connections. Concurrent pumps share the in-flight work and its original options.
4. **Fog projection can fail silently for one tribe.** `projectStateForTribes` (`state-projection.ts`) reports a per-Tribe failure instead of throwing; `createMatchLogic` logs it as `fog_projection_failed` and skips the send — that tribe just doesn't get a state update. Other tribes proceed normally.
5. **Compact checkpoints.** Optional `MatchState.execution` is `bot-running | cleanup-pending`; human/bot/ended eligibility derives from game state. A resumed bot restarts from the committed turn boundary without changing its deadline. `checkpoint.ts` validates game relationships and execution/schedule consistency, converting the previous native envelope on load. New saves use `normalized-match-v4`; `normalized-xstate-v3` remains readable, earlier versions remain incompatible. WebSocket metadata stays in attachments.
6. **Recovery.** Local save and delete failures rearm through exponential backoff capped at 30 seconds, without a finite attempt budget. Persist `cleanup-pending` before deletion and retain it until deletion succeeds; terminal checkpoints admit only cleanup retries. `dispose()` aborts host work and cancels scheduling while retaining durable state.

## Effect kinds (`types.ts`)

`stateChanged | messageToTribe | broadcast | gameEnded | matchDestroyed | log | awaitBotTurn`. Keep `host.ts::dispatchEffect` exhaustive and update `MatchHost` adapters when adding a variant. `publishMatchTransition` interprets effects only after local commitment, then emits lifecycle events.

- `awaitBotTurn` maps to `MatchHost.scheduleBotTurn(tribe, difficulty, gameState)`. `logic.ts` owns one abort controller and re-dispatches `botTurnResolved` against current match state, carrying the base game state for stale-result validation. `pendingBotTurns` exposes completion. Hosts must await `logic.onAlarm()` so bot computation and resolution settle before the alarm returns.

## MatchHost adapters

| Host       | Where                                                                 | Notes                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare | `apps/game-server/src/match.ts` (embedded in `createMatchLogic` deps) | `saveState` → `ctx.storage.kv.put`; `broadcastAll` / `sendToTribe` → `ctx.getWebSockets()`; `endGame` → D1 via `writeMatchResult`.                                    |
| Offline    | `match/offline.ts` via `createMatchLogic`                             | Browser `commitLocally` awaits IndexedDB before memory publication; broadcasts are in-process; bot pacing uses the injected `BotPacer`.                               |
| Recording  | `match/recording-host.ts`                                             | Test adapter: every method appends to a `RecordedCall[]` array. `queueBotTurn` lets tests deterministically resolve a bot run without invoking the real `runBotTurn`. |

Cross-host parity (`match/host.test.ts`) asserts that the same `MatchCommand` produces an identical observable host-call sequence on any conforming `MatchHost` — adding a host that diverges will fail this test.

## Lifecycle events (`ports.ts`)

`turnAdvanced | actionPerformed | botTurnStarted | botTurnCompleted | botTurnFailed | gameOver | commandRejected | chronicleEntries`. Emitted from `step()` as a sibling stream to `Effect[]`. Payloads carry only public facts (tribe, turn, Intent, message, structured chronicle entries) — no `MatchState`, `GameState`, or `TurnSchedule`. `createMatchLogic` fires `observer.onLifecycle(e)` after all effects for that step have been interpreted, so observers see a consistent post-effect world. The `log` effect is preserved for wide-event parity — lifecycle is additive, not a replacement.

## Chronicle (`chronicle/`)

Pure derivation of structured Match-chronicle entries (research, capture, kill, level-up, turn-advance, game-over). `entriesFromBroadcastEvents` maps `BroadcastEvent`s from the turn pipeline; `entriesFromCombatEvents` maps `CombatEvent`s from `dispatch`. `filterEntriesForViewer` enforces the Fog-of-War contract — non-public events whose Tile is not visible to the viewer are dropped. The Turn Executor now returns turn-derived `chronicleEntries` directly; `step` broadcasts all chronicle entries as `{ type: 'chronicleEntries', entries }` and emits the matching lifecycle event. Offline matches accumulate entries via `OfflineMatchHandle.getChronicle()` (capped to the most-recent N entries — default 200). Online clients append the server message and fog-filter in the chronicle hook.

## Anti-patterns

- Don't call `broadcast.sendToTribe` from `step` — `step` is pure. Emit a `messageToTribe` effect; the host interprets.
- Commit changed state before rearming the scheduler or publishing effects. Keep async commits serialized so commands cannot overtake each other.
- Don't swallow `PersistenceError`. Always route through `onPersistenceError` so the host can page / retry.

## Dependencies & Edges

- Consumed by: `apps/game-server/src/match.ts` (production online host) and `apps/web/src/routes/game.tsx` via `createOfflineMatch` (offline single-player).
- Uses: `../dispatch.ts`, `../fog-of-war/` (per-tribe projection), `../multiplayer/types.ts` (wire messages), `../multiplayer/codec.ts`, `../bot/bot-pacer.ts` (offline pacing).
- Tests are authoritative: `logic.test.ts`, `step.test.ts`, `outcome.test.ts`, `initializer.test.ts`, `codec.test.ts`, `offline.test.ts`, `offline.fog.test.ts`, `state-projection.test.ts` — prefer reading tests over rerunning the reducer in your head.

## Patterns & Pitfalls

- Preserve state identity for no-op transformations. Starting a bot or committing terminal cleanup changes the execution marker and requires a durable write before its effect runs.
- `destroyMatch()` is only reachable via the `matchDestroyed` effect. Cleanup deadline scheduling lives inside `step` — don't emit `matchDestroyed` from the host directly.

Structured match logs use `MatchLogData`: scalar, array, and nested fields only. Raw caught exceptions stay in tagged error causes and are normalized by the host; they are not arbitrary log payloads.

Match initialization rejects player counts above `board/map-capacity.ts` limits before generation. Map dimensions never grow to fit a roster.
