# Bot AI

## Purpose & Scope

Single-turn decision maker for AI tribes. Constructs a `ScoringFixture` from the current `(state, tribe, gameHex, radius)`, runs the scorers a personality enables, applies personality-scaled noise, returns the top-scored action. Optionally does one-ply lookahead for movement decisions.

## Entry Points & Contracts

- `createBot({ personality, rng?, scorerWeights? })` → `Bot` with `chooseAction` (top pick) and `scoreActions` (ranked list, for tests/debug).
- `personalities` (`personality.ts`) — pre-baked `Record<DifficultyId, BotPersonality>`. Adding a new personality is a single record entry; no scorer edits required.

The 10 scorer files are package-private. The only public surface for tuning bot behavior is the `BotPersonality` shape.

## How to add a new personality

1. Add an entry to `personality.ts::personalities`.
2. (Optional) Set `weights` to bias scorer outputs, `enabledScorers` to opt out of scorer kinds, `lookahead`/`positionalAwareness` to flip movement-scorer modes, `noiseRange` to control jitter.
3. Write a personality boundary test in `personality.test.ts` — assert _picked actions_, not raw scores.

## How to add a new scorer

1. Create `scorers/my-scorer.ts` exporting `scoreMyActions(fixture: ScoringFixture): ScoredAction[]`.
2. Add the new `ScorerKind` to `score-context.ts`, then register the scorer in `scorers/registry.ts::scorerByKind`.
3. Add the new kind to every personality's `enabledScorers` (or omit deliberately).
4. **Scorer signature:** `Scorer = (fixture: ScoringFixture) => ScoredAction[]` (see `score-context.ts`).

Movement is special: `scorers/registry.ts` branches on `fixture.lookahead` to call `scoreMoveLookaheadActions` instead of `scoreMoveActions`. Lookahead cost is O(moves²) — only enabled on harder personalities.

## Anti-patterns

- Don't read `Difficulty` or `BotPersonality` inside a scorer. Personality flows into the fixture (as `lookahead`, `positionalAwareness`) and is applied via `applyPersonalityWeight` after scoring. Scorers must be personality-agnostic.
- Don't execute actions inside a scorer — just return `ScoredAction` candidates. Execution is the caller's concern (`runBotTurn` runs `.execute()`).
- Don't use `Math.random()` inside a scorer. The `rng` is injected on the `Bot` for reproducibility; scorers must be pure functions of `fixture`.

## Turn loop

`runBotTurn` seeds its scoring RNG from the match seed, turn number and tribe. Replaying the same turn-boundary state produces the same action sequence without consulting ambient `Math.random`. Keep that stream local to the turn so concurrent matches cannot influence one another.

- `runBotTurn(gameState, tribe, difficulty, gameHex, opts?)` (`bot-turn.ts`) — **the** bot turn loop. Resolves the personality from `personalities[difficulty]` and constructs one bot per turn. Always async. Loops `chooseAction → executeBotAction` until null / `maxActions` / `maxConsecutiveFailures`, then calls `advanceTurn` once. Returns `{ finalState, intermediateStates, error? }`. Scorer/executor throws are caught, recorded on `error`, and the turn still advances. Pacing is injected via `BotPacer` (`bot-pacer.ts`) — `immediatePacer` for server / tests, `delayPacer(startMs, actionMs)` for UI animation. Cancellation via `AbortSignal` rejects mid-turn without calling `advanceTurn`.
- `executeBotAction(gameState, plan, tribe, gameHex)` — public single-step primitive. Handles `move | attack | tileAction` through `executeCommittedIntent`, preserving dispatch validation and fog commits. Use this directly in tests that exercise one decision without the whole loop.
- `bot-turn.ts` uses a bounded async loop over private intermediate projections. Each attempt checks cancellation, awaits pacing, checks cancellation again, then chooses and executes an action. Preserve RNG call order. Intermediate steps are computation results, not durable match commits.
- The match chart calls `transitions.ts::handleRunBotTurn`, which emits `awaitBotTurn`. After local persistence, `publishMatchTransition` routes it to `scheduleBotTurn`. `match/logic.ts` owns the abort controller and returns `botTurnResolved` against current match state, carrying the base game state for stale-result validation. A resumed `bot.running` match restarts from its committed turn boundary.

## Dependencies & Edges

- Consumed by: `../match/logic.ts` (the embedded `MatchHost.scheduleBotTurn` awaits `runBotTurn` with the configured `MatchLogicDeps.botPacer` to satisfy the `awaitBotTurn` `MatchEffect`) and `apps/web/src/routes/game.tsx` via `createOfflineMatch` (offline play injects a `delayPacer` through the match factory; the old UI-side `runBotTurn` orchestration is gone).
- Uses: `../combat/resolve.ts::previewCombat` (attack scorer), `../dispatch.ts` (feasibility checks), `../board/board.ts`, `../domains/*`.

## Patterns & Pitfalls

- `ScoredAction.score` carries rank info; `ScoredAction.execute` carries the plan factory. The pairing lets the caller score-then-pick in one pass.
- Scorer iteration order in `scorers/registry.ts::scorerByKind` is load-bearing: `Array.prototype.sort` is stable, so equally-scored candidates fall back to that order. The order matches the legacy `scorer-registry.ts` array; do not reshuffle without re-asserting personality boundary tests.
- Noise is added _after_ personality-weight scaling, using `personality.noiseRange * (rng()-0.5)*2`. Higher difficulty → narrower noise, so better picks win more reliably.

`ScoringFixture.playerState` carries the readonly `PlayerRead` returned by the player getter. Its cached units, tile filters, candidate tiles, and enemy queries preserve deeply readonly views too. Scorers must not mutate data through these derived reads.
