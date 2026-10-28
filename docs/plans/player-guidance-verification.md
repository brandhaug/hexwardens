# Player guidance verification

Failure cases recorded before implementation: ready count disagrees with cycling or includes passed/recruited units; touch has no cycling control; old preferences change confirmation defaults; keyboard and pointer confirmation diverge; later-turn tutorial replay is hidden; deselection or reload regresses completed lessons; spent recruits falsely finish movement; draw displays defeat or no result; opening preview disagrees with spawned troops; city plaque omits capital/income; sight is mislabeled as technology-adjusted.

Repeatable smoke, twelve browser actions:

1. Open `/single-player-new`.
2. Choose Barbarians. Check starting forces and gold.
3. Start match. Check Next unit count and capital income.
4. Skip onboarding.
5. Select Next unit.
6. Open menu.
7. Turn off Confirm end turn.
8. Close menu with Escape.
9. Press End Turn once. Check turn advances.
10. Open menu.
11. Select Replay tutorial. Check welcome prompt.
12. Reload. Check replay prompt persists.

Command: `pnpm -C apps/web exec playwright test e2e/player-guidance.spec.ts e2e/end-turn.spec.ts e2e/draw-result.spec.ts e2e/keyboard-board.spec.ts e2e/keyboard-combat.spec.ts --reporter=list`.

Observed results: TypeScript and targeted lint passed. The two onboarding test files passed all 29 tests. The dedicated preview at `http://127.0.0.1:4179` passed all nine initial browser scenarios: three guidance, three end-turn, two keyboard-board, and one saved-draw. The focused follow-up passed keyboard combat and reran saved-draw successfully, two tests in 17.3 seconds, bringing coverage to ten passing browser scenarios.

The combat scenario uses shared match initialization with seed 42 and the registry's `unitsLow` helpers to place a one-HP enemy Caveman beside an opening unit. It uses native keyboard activation to select and attack, verifies the enemy disappears and the attacker occupies the target, and checks all unexplored option labels contain only coordinates and “unexplored”. A separate hidden enemy retains that restricted label after combat. The test attaches `keyboard-combat.png`.

The focused follow-up ran `keyboard-combat.spec.ts` and `draw-result.spec.ts` from `apps/web` with the temporary Playwright configuration described below. The first fixture attempt selected a Seer by array order and failed its Caveman assertion; explicit unit-type selection corrected the fixture. No production change was needed.

The earlier default-port attempt reached an unrelated reused `localhost:3001` server, was cancelled, and is excluded from acceptance evidence.

The dedicated preview uses the repository web app with `HEXWARDENS_USE_WORKERS_SHIM=1 HEXWARDENS_USE_WORKERS_SHIM_MEMORY=1 pnpm -C apps/web exec vp dev --host 127.0.0.1 --port 4179`. Its temporary Playwright config sets `baseURL: 'http://127.0.0.1:4179'`, one worker, a 60-second timeout and Chromium `--enable-unsafe-swiftshader`, with no managed web servers. The standard reproduction command above uses the checked-in config and requires this repository's web server on port 3001.

Review regression: `pnpm -C apps/web exec playwright test e2e/research-prices.spec.ts`. Both scenarios passed against the same dedicated preview. With two villages, Farming displays eight gold, is disabled with seven, and succeeds with eight while leaving zero. The test waits for the app hydration marker before navigating through Single Player and Continue. Total browser coverage is twelve passing scenarios.
