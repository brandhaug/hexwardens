# Normalized engine verification

The gameplay reference is the pre-rewrite commit
`958c8a235d5c1ee553f42e280be97fe1e3720481`. Golden transcripts for seeds 7, 42
and 2026 cover generation, eight bot turns, intermediate states and both
players' fog projections. Their expectations remain unchanged.

## Failure cases

Before simplifying storage and orchestration, the verification plan covered:

- Input/read/projection aliasing, ragged boards and deterministic traversal.
- Partial writes after rejected moves, duplicate spawns or failed economy edits.
- Recruitment-capacity ownership and shared veterancy calculations.
- Turn order, seeded bot decisions and authoritative fog projections.
- Duplicated game checkpoints, corrupt actor envelopes and transient-effect replay.
- Failed-save publication, queued-command order and disposed-host commits.
- Bot cancellation with a pacer that never settles, stale results and recovery.
- Absolute deadlines and cleanup after storage deletion fails across a restart.
- Legacy human, ended, scheduled/running bot and terminal checkpoints converting
  without replaying effects or losing deadlines.
- Concurrent asynchronous initialization, rejected persistence promises and queue recovery.

Storage and compact-checkpoint tests were updated before implementation.
The initial compact-checkpoint checks caught duplicated game data in native actor
envelopes. The subsequent direct-routing checks failed before implementation on
the missing conversion boundary and asynchronous commit contract. Existing bot
cancellation coverage caught the non-cooperative pacer case during simplification.

## Local checks

Validated on 2026-10-12:

- `pnpm run test`: 919 game-logic, 375 web, 212 game-server, 55 lint-plugin and
  6 infrastructure tests passed. The existing 11 CI-gated script tests skipped.
- `pnpm run typecheck`: workspace TypeScript, strict native Effect diagnostics
  and repository TypeScript passed.
- `pnpm run lint`, `pnpm run format:check`, `pnpm run dead-code`: passed.
- `pnpm -C packages/game-logic exec vp test run src/match/checkpoint.test.ts src/match/lifecycle.test.ts src/match/commit.test.ts src/match/logic.test.ts`:
  50 checks passed after review repairs. Review reproduced
  publication after disposal in the microtask between commitment and publication.
  The existing initialization and disposal cases were extended before the repair;
  both failed and now pass with a disposal check immediately before publication.
  `pnpm -C packages/game-logic exec vp test run src/match/commit.test.ts src/match/logic.test.ts`
  passed all 39 checks after that repair.

## Browser reproduction

Independent review found additional failure cases: reconnect writes split across
commits, lost disconnect events, offline result cleanup while viewed, contradictory
bot wake schedules and unlocked input during end-turn persistence. Regression
coverage was added before those repairs. Shared outcome and village-reward
calculations now serve both production and compatibility callers.

A second review reproduced retained turn schedules after game-ending forfeits,
terminal checkpoints accepting connections, and an outgoing turn timeout executing
after a queued end-turn save. Regression tests failed before the fixes and pass
after clearing schedules at outcome sealing, requiring a connection-count increment
for admission, and checking the selecting checkpoint before executing alarm work.

Run from `apps/web`, with ports 43127 and 8787 free. The values below are public
local-test placeholders. Playwright starts both hosts with matching origins.

```sh
BETTER_AUTH_SECRET=ci-smoke-better-auth-secret-placeholder-00 \
AUTH_JWT_SECRET=ci-smoke-auth-jwt-secret-placeholder-0000000 \
HEXWARDENS_E2E_WEB_PORT=43127 \
PLAYWRIGHT_HTML_OPEN=never \
pnpm exec playwright test --reporter=html,list --retries=0
```

The HTML report is `apps/web/playwright-report/index.html`; attachments include
`durable-turn-after-retry-and-reload`. The save-recovery test aborts an IndexedDB
transaction, verifies failure feedback and unchanged turn, retries, then reloads
and checks the durable turn. Bot spectator and multiplayer paths use the same
shared simulation. Generated reports and screenshots are untracked.

Before removing XState, the complete Chromium run passed all 46 tests with retries
disabled in 2.9 minutes, then in 3.1 minutes after review repairs. The direct-routing
run passed 45 tests in 5.7 minutes. Guest reload failed before lobby creation while
an intermediate WebSocket-handler edit prevented the development server rebuilding.
The isolated guest-reload rerun passed on the committed code in 34.8 seconds with
retries disabled. Reproduce it with the same environment above and
`PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/guest-recheck pnpm exec playwright test e2e/guest-match-reload.spec.ts --reporter=html,list --retries=0`.
Its report is `apps/web/playwright-report/guest-recheck/index.html`.
After the disposal repair, both saved-match reload cases passed. Guest reload
exceeded the 30-second whole-test limit during concurrent checks, then passed
without concurrent checks in 20.5 seconds. The final command used the same
environment with `PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/guest-final` and
`pnpm exec playwright test e2e/guest-match-reload.spec.ts --reporter=html,list --retries=0 --timeout=60000`.
Reports are under `apps/web/playwright-report/disposal-recheck/` and
`apps/web/playwright-report/guest-final/`.
`pnpm run build` passed for the web app and game-server dry run.
`pnpm -C apps/web run build-storybook` and `pnpm run infra:check` also passed.
