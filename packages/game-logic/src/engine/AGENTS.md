# Engine storage

`createGameWorld(state)` constructs a private command workspace with indexed tile, unit and player records. Metadata and row dimensions stay private to the world. `GameState` is the immutable projection consumed by callers.

## Contracts

- `world-contract.ts` is the gameplay interface. Keep maps and occupancy indexes inside `world.ts`. Validate each write before replacing owned records; read methods return detached data.
- Construct a candidate from the last committed state. Return `snapshot()` only after every rule succeeds. Discard the whole candidate on failure, including earlier successful writes.
- An unchanged workspace returns the original input reference. Changed snapshots are detached. Hosts use projection identity to distinguish no-ops from commits.
- Unit records own position and retain domain unit IDs. The occupancy index follows validated unit writes; tile projections join occupants by that position. Reject missing tiles, duplicate IDs and occupied destinations before changing indexes.
- Tile and unit iteration is row-major; player iteration preserves insertion order. These orders affect seeded bot decisions and turn rotation.
- `removeUnit` releases recruitment capacity once when its home village still belongs to the unit's tribe. Callers must not decrement it again. Movement preserves the home link; spawning does not charge capacity.
- `decodeGameSnapshot` validates stored projections and board/unit relationships. Schema definitions depend on static value modules, not gameplay orchestration.

## Verification

`world.test.ts` exercises the storage interface. `apps/web/src/lib/gameplay-parity.test.ts` holds pre-rewrite SHA-256 transcripts for authoritative state and both viewer projections. Preserve those expectations when changing implementation. Gameplay changes require an explicit product decision.
