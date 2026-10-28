# Normalized engine and durable matches

Accepted with the orchestration amendment below. The original decision records the intermediate XState implementation.

Accepted. Keep the normalized `GameWorld` domain interface and gameplay handlers. Private indexed maps replace Bevy for tile, unit and player storage. Immutable `GameState` projections preserve the host, renderer and wire contracts. Gameplay rules, seeded results, domain IDs, iteration order and RNG call order remain unchanged.

Each command gets a private candidate world. Validate writes before replacing owned records; return detached reads and changed projections. Unit records own positions, with a private occupancy index for tile joins. Failure discards every mutation in the candidate. Reconstructing worlds at command boundaries costs allocation but isolates failed work. An unchanged world returns its input reference.

Turn advancement runs the existing ten phases in a synchronous ordered loop. Bot execution uses a bounded async loop with injected pacing and cancellation. XState v5 owns only coarse match event eligibility: human, bot scheduled/running, ended and terminal cleanup. These boundaries keep rule sequencing in plain functions and runtime work in the host. Effect supplies schemas, typed results and host I/O; pure rules need no new Context services.

Production and tests share one pure `step` interpreter. Command events carry current state. Persist the native XState snapshot in `MatchState.orchestration` beside the single authoritative `gameState`, with compact context `{ result: null }`. Clear transient results before checkpointing. Cleanup passes through `destroying` to final `destroyed` on checkpoint, so a failed storage deletion can retry from the terminal checkpoint after host reload.

`match/logic.ts` owns serialized persistence, scheduler/backoff, the pump and abort-controller cancellation. Local persistence completes before success replies, broadcasts or candidate lifecycle publication. Failure retains committed state and rejects the submission, allowing multiplayer to roll back its optimistic overlay. Offline commands await actual IndexedDB transaction completion; cloud replication and D1 result writes remain asynchronous. This updates the synchronous offline processing described in [ADR-0010](0010-eager-action-commitment-no-in-turn-undo.md), retaining eager submission and no in-turn undo.

Resumed bot work restarts from the last committed turn boundary. Preserve absolute deadlines and cleanup behavior across restoration. Local persistence recovery uses capped exponential backoff, up to 30 seconds between retries, without a finite attempt budget. Saved games use `normalized-xstate-v3`; older versions are incompatible and have no migration.

## Orchestration amendment

Retain normalized storage, plain turn/bot loops and durability guarantees. Replace XState with direct command routing in `step.ts`. The chart duplicated human/bot/ended facts already present in game state and required restoration, transient-result clearing and consistency checks on every command. Persist only independent execution facts: `bot-running` suppresses duplicate starts; `cleanup-pending` blocks admission while deletion retries. Gameplay changes clear the previous bot's execution marker; the host rejects results computed from a stale game projection.

One awaited `MatchPersistence.saveState` operation commits initialization and command candidates. The browser adapter hides IndexedDB behind that port. The host serializes all commands, publishes only after a successful commit, and awaits bot completion outside the commit queue so resolution can re-enter it. All hosts initialize asynchronously. Disposal prevents publication of pending work.

New saves use `normalized-match-v4`. `checkpoint.ts` validates and converts `normalized-xstate-v3` checkpoints on load, including running bots and terminal cleanup, preserving absolute deadlines. The legacy native envelope is read-only compatibility data; new writes omit it. Earlier pre-normalized saves remain incompatible. This amendment supersedes the XState, native snapshot and split persistence choices above.
