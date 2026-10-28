# Backend strict migration

Baseline: `7677b8e8fa4115ef67dababc76dded675a4269df`.

## Failure cases before manual migration

Existing coverage must continue to reject invalid JWTs, spoofed forwarding identities, unavailable platform limiters, cross-site auth forms and malformed WebSocket attachments. Adapter changes must preserve durable presence release, ordered lifecycle effects, retry bounds, credential throttling and opaque error diagnostics. Missing player entries and empty database results must be handled without assertions; optional API fields must retain their absence semantics. Existing tests will validate these behaviors before any additional isolated tests are considered.

Initial strict checks found unchecked result indexing, Drizzle's renamed SQLite database type, exact-optional request mismatches, and lint violations in host adapters and tests. Borrowed parent files are validation inputs and will not enter this commit.

Daily date review: `DailyDate` is currently an alias for string, so the service's runtime date guards must remain even when HTTP schemas already validate dates. Invalid dates must fail before database queries, remain opaque over HTTP and never appear in telemetry; replace the former defects with a tagged failure and map that failure at the API adapter.

## Implemented changes

- Migrated the lobby database contract to Drizzle's current `SQLiteAsyncDatabase<'sync', unknown>`, preserving its synchronous storage driver and existing awaited query API. Invite-code generation reads its random byte through DataView; host transfer handles the first remaining player explicitly.
- Replaced HTTP response assertions in integration tests with hoisted schema decoders, non-null assertions with narrowing assertions, and conditional test assertions with unconditional checks after narrowing. Existing tests retain their behavioral expectations.
- Schema-validates durable WebSocket metadata and uses Effect predicates for representation checks. Presence release still flips the durable attachment flag before decrementing; queue admission and deletion keep SQL ordering.
- Preserved the Cloudflare class imports as erased `import type` declarations. The strict inline-type autofix otherwise leaves empty runtime imports, loading `cloudflare:workers` during Node tests; the reproduced failure affected seven suites and disappeared after this repair.
- Converted native limiter promises and IndexedDB callbacks to Effect adapters without changing fail-closed behavior or local fallback eligibility. The browser saved-match store uses one-shot event listeners; sync fallback and concurrent tombstone persistence retain their prior behavior.
- Updated saved-match conditional upsert to Drizzle's `setWhere` and array-returning API. Empty conditional updates remain conflicts instead of relying on the newer `.get()` signature's non-optional result. Start payload validation uses the current `validator` method and a tagged error.
- Kept runtime daily-date checks because the domain alias does not prove validity. Invalid dates now produce `InvalidDailyDate`; HTTP adapters return an opaque InternalError, while match completion errors remain isolated per player.
- Kept request/exception redaction and typed span totals. API client configuration errors enter the HTTP client's typed failure channel rather than throwing arbitrary exceptions.
- Applied strict brace, type-import, nonmutating-array, mock typing and formatting rules in owned paths. No root lint rule or compiler setting was changed.

## Narrow exceptions

Inline rationale accompanies every exception introduced here. Start's server-only marker must be a side-effect import. Cloudflare's structured-clone attachment methods, Promise rejection callbacks, Start payload decoders and the redaction function accept unknown inputs at their external boundary. Structured Effect logger fields retain an open dictionary contract only inside the logger adapter; span payloads have concrete types. SQL loops remain serial because each later step depends on cleanup/seat state or ordered deletion. Effect Vitest assertions and assertions about known Config error text have targeted test-only exceptions. There are no unsafe type assertions, non-null assertions or generic error-text extraction helpers in the migration.

## Validation

Using the coordinator's current dependency, lint, infrastructure and game-logic files as temporary validation inputs:

- Strict Vite+ type-aware lint passed across 104 owned TypeScript paths; the root lint run independently reported zero diagnostics in these paths.
- Full game-server TypeScript check passed. The web check reports zero owned-file errors; unrelated UI and other E2E files still fail the integrated snapshot.
- Native `effect-tsgo` diagnostics passed in both apps with zero errors and zero warnings. Remaining informational suggestions concern the existing lazy presence service and unrelated client code.
- Full game-server suite passed: 21 files, 200 tests. The later daily validation refinement passed its focused 3-file, 22-test regression run.
- Full web suite passed: 45 files, 333 tests, including saved-match store/sync/lifecycle, JWT signing, auth configuration and redacted request logging.
- Auth E2E passed: 14 Chromium tests in 42.1 seconds. This includes signup, signin, session persistence, logout, private security headers, cross-site refusal and native-form credential throttling.
- Production web build passed, including Start import protection.
- Required root lint/typecheck/format commands were executed. The borrowed integration snapshot still has 1,368 lint diagnostics outside this slice, 210 formatting failures outside owned source, and UI/infra type errors; these remain coordinator-owned integration work. The full-repository autofix commit hook is omitted so it cannot rewrite other workers' files; scoped checks ran directly.

The auth browser run uses the web-only port-3019 config and disposable environment values documented in [the security audit](./application-security-upgrades.md#validation). Reproduction command: `pnpm -C apps/web exec playwright test --config security-playwright.config.ts e2e/auth.spec.ts`. The temporary config is excluded from the commit. After integrating every slice, repeat the standard two-server Playwright run.

Other repeatable commands:

```sh
pnpm -C apps/game-server test
pnpm -C apps/web test
pnpm -C apps/web build
pnpm -C apps/game-server typecheck
pnpm -C apps/web typecheck
pnpm run lint
pnpm run format:check
```

Only owned source and this report are committed. Borrowed policies, manifests, lockfiles, game logic, infrastructure, plugin code and the D1/Workers fixtures are restored before committing. No cloud resources, secrets, deployment or PR state was changed.

Current API references checked against the installed declarations and official documentation: [Drizzle Durable SQLite](https://orm.drizzle.team/docs/get-started/do-existing) and [Effect v4 schema data types](https://effect.website/docs/v4/schema/effect-data-types).
