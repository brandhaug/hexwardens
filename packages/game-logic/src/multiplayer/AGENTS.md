# Multiplayer (wire types + codec)

## Purpose & Scope

Type definitions and zod-backed codec for the WebSocket wire protocol between `apps/web` and `apps/game-server`. Owns `ClientMessage` / `ServerMessage` discriminated unions, lobby shapes (`LobbyState`, `LobbySlot`, `LobbyConfig`), `MatchConfig`, and `MatchResult`. Does **not** own match state — that's `../match/`.

## Entry Points & Contracts

- `types.ts` — message unions. Every variant has a `type` discriminator. Adding a variant requires a handler in `match/logic.ts::onClientMessage` for `ClientMessage`, and a `ServerMessageHandlers` case in `apps/web/src/lib/game-client.ts` for `ServerMessage` (the client uses a mapped-type handler bag that fails to compile if any variant is missing — see `apps/web/AGENTS.md`).
- `codec.ts` — `createCodec()` returns `{ decode(raw): Effect Result<ClientMessage, CodecError> }` for the `MatchCodec` port. Server-to-client traffic is encoded as a `ServerWireFrame` envelope (`protocolVersion`, `sequence`, `messageId`, `message`) via `encodeServerWireFrame`; `decodeServerWireFrame` requires that envelope and rejects legacy bare `ServerMessage` frames.
- `MatchResult` — the gameEnded payload persisted to D1 `match_results` and `player_stats`.
- `turnEvents` — server→client broadcast carrying the `BroadcastEvent[]` produced by `advanceTurn` (`../turns/events.ts`). The events are re-exported from here; `match/step.ts` emits a `broadcast` `MatchEffect` with `{ type: 'turnEvents', events }` whenever the turn pipeline has any events to forward.
- `chronicleEntries` — server→client broadcast carrying structured Match chronicle entries produced by the Match/Turn interfaces. Online clients append these directly and fog-filter at render; they must not rebuild chronicle entries from `turnEvents`.

## Anti-patterns

- Don't bypass the codec for "trusted" messages. The server's `onRawMessage` is the only entry point and always decodes — adding a side-channel breaks the schema contract.
- Don't strip the server wire envelope at the transport edge. Clients may dispatch the nested `message`, but sequencing, protocol version, and decode diagnostics belong to the multiplayer client transport.
- Don't put server-only shapes here (e.g. `MatchState`, `MatchEffect`). The rule of thumb: if `apps/web` shouldn't know about it, it belongs in `../match/types.ts`, not here.
- Don't store board coordinates as `BoardPosition` on the wire. Messages use `{ r, q }` (see `action`/`actionRequest`); `dispatch` translates to `{ r_idx, q_idx }`. Keeping the wire shape untied to internal array indexing is deliberate.

## Dependencies & Edges

- Consumed by: `../match/logic.ts`, `apps/web/src/lib/game-client.ts`, `apps/game-server/src/match.ts`.
- Uses: `zod`, `effect/Result`, `effect/Schema.TaggedErrorClass`, `../domains/tribe.ts`.

## Patterns & Pitfalls

- Discriminated-union exhaustiveness is enforced structurally on both ends. A new `ServerMessage` variant is a breaking client change — roll out server→client adds before client→server receives.

Village-perk and filtered-grid schemas use readonly array types. This is a TypeScript access restriction, not a wire-format revision; JSON arrays and validation remain unchanged.
