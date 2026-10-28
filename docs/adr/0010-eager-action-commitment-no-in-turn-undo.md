# Eager Action commitment without in-Turn undo

Player Actions are sent to the authoritative engine the moment they are issued and committed atomically: in multiplayer the client eager-sends each Action over WebSocket and waits for server acknowledgment before accepting the next click; in single-player the in-process `MatchLogic` processes each Action synchronously. There is no in-Turn undo and no client-side action staging — the End Turn message carries no payload, since every Action is already committed.

This unifies offline and online behaviour against a single `dispatch` pipeline and makes Fog of War reveal an immediate consequence of each Action (per-Action server projection in multiplayer, local dispatch in offline) instead of waiting for End Turn. The cost is a real player affordance: the previous staging stack allowed free undo/redo within a Turn, and players in multiplayer must now tolerate one round-trip of latency before the next Action is accepted.

## Considered and rejected

- **Keep staging in multiplayer with server-side speculative reveal or a preview RPC.** Speculative shipping leaks terrain outside the current Fog of War contract; a preview RPC adds a parallel server surface for what is effectively the optimistic-apply path with extra steps.
- **Per-Action undo via a server `undoAction` message.** Requires a per-Turn Action log and inverse handlers for every Action (combat, capture, research, perk pick). The implementation cost exceeded the value of the affordance for both modes.
- **Eager send only in multiplayer, keep offline staging.** Splits the staging code path in two and asymmetrically rewards single-player. The simpler model is "Actions commit immediately" everywhere.
