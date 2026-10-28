# Turns

`advanceTurn(state, ctx?)` is the public turn operation. It creates a private `GameWorld` and runs the ordered loop in `index.ts` synchronously. `turn-rules.ts` contains the internal rules. A failed phase discards the candidate; only a completed loop returns a projection.

## Phase order

```
salary -> techPassives -> research -> unitReset -> debuffTick ->
explorationCommit -> villageExperienceCommit -> rotation -> captureFlip -> gameOver
```

Salary, passives and research credit the ending tribe. `ctx.tribe` overrides that tribe. Reset and debuff ticking happen once per full round, before rotation. Exploration and level-up announcements use the ending player. Capture resolves after rotation, at the capturing tribe's next turn. Outcome detection sees the completed capture.

## Contracts

- No active players returns the original state and empty event/phase streams.
- `TurnAdvance` includes broadcast-shaped events, derived chronicle entries, outcome, next tribe, and the executed phase trace. `newCurrentTribe` is null exactly when the game ended.
- `phaseOrder` owns sequencing. Rules do domain work through `GameWorld`; they never mutate input projections. Preserve phase order and RNG call order.
- Append each completed phase to `phaseLog` before running its successor. Persist only settled match boundaries.
- Capture resolution belongs to `actions/features/capture/lifecycle.ts`; the turn rule calls its world operation. Outcome policy belongs to `match/outcome.ts`.
- Bots and hosts call `advanceTurn`; individual rules are internal. Consumers forward returned events and chronicle entries rather than diffing states.

`advance-turn.test.ts` pins per-turn/per-round behavior and phase ordering.
