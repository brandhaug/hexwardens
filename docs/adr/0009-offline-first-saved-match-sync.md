# Offline-first Saved Match sync

Single-player `/game` gets one active **Saved Match** slot, stored first in a platform-neutral local `SavedMatchStore` and replicated remotely for logged-in Players through `apps/web` server functions backed by the shared D1 database. The local web adapter may use IndexedDB, but IndexedDB is not the domain contract; future Electron or iOS shells can provide SQLite, file-backed, Core Data, or other adapters behind the same store boundary.

The Saved Match payload is a versioned full `MatchState` snapshot plus summary metadata for continue and conflict prompts. Full snapshots are acceptable here because this is single-player state owned by the Player, not multiplayer `FilteredGameState`; this storage path must not be reused for online multiplayer Match recovery. Local writes happen after every committed Match state change so offline play is durable, while remote sync is best-effort and debounced.

`packages/game-logic` owns the pure Saved Match envelope, metadata derivation, and compatibility validation because it owns `MatchState`; it must remain storage-free. Runtime storage adapters and sync orchestration live in `apps/web`: IndexedDB or an equivalent local adapter behind `SavedMatchStore`, plus server functions for authenticated remote D1 sync.

Remote sync requires login and uses revision-checked writes instead of blind overwrites. A write includes the client's last-known base revision and the new revision; the server accepts only if the current remote revision still matches the base, otherwise the client resolves divergence by showing both Saved Match Revisions. Deletes are tombstone revisions, so acknowledging a completed Match on one device prevents an older unfinished copy from being resurrected on another.

## Considered and rejected

- **Action-log replay instead of snapshots.** Replaying from seed looks compact, but old action logs become fragile when Match rules change. A versioned snapshot can fail closed, migrate intentionally, or ask the Player to start a new Match.
- **Game-server-owned remote saves.** The game-server owns online lobbies and authoritative multiplayer Match Durable Objects. Single-player Saved Matches are profile/auth data for `/game`, so `apps/web` should own the API while `packages/db` owns the shared schema and migrations.
- **Anonymous remote saves.** Guests keep local-only Saved Matches. Guest remote state would require stable anonymous identity, cleanup policy, abuse controls, and account-merge semantics before it adds much value.
- **Blind remote upsert.** It is simpler but lets stale tabs or second devices silently overwrite newer offline progress.
