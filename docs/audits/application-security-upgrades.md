# Application security upgrade audit

Baseline: `55334e3b9344ca7f856d897886108685b6730556`. Source: `/Users/brandhaug/IdeaProjects/b2b-saas-starter`, inspected read-only without reading secret environment files.

## Failure cases recorded before implementation

- An attacker rotates `X-Forwarded-For` or `True-Client-IP` when the platform IP header is absent and receives a fresh limiter bucket.
- Form sign-in and sign-up call Better Auth's internal API, bypassing its HTTP rate limiter and dropping the request's origin/IP context.
- A game token has an extra segment, invalid base64, an unsupported signed header, or expires exactly now. It must produce a typed refusal, never authenticate or crash the verifier.
- Authentication failures contain adapter messages or request data and are reflected in redirect URLs or logs.
- Cross-origin form posts execute a server function after custom Start middleware displaces the default CSRF middleware.
- Security header wrapping loses Set-Cookie, redirect status, existing Vary values, or a WebSocket upgrade.
- A personalized SSR/server-function response can be cached and served to another session.

Existing browser auth flows will verify successful sign-up, sign-in, session persistence and logout. Boundary tests cover malformed cryptographic input and spoofed proxy headers that browser flows cannot generate reliably.

Additional failure cases before the next changes: missing/short auth secrets, credential-bearing or insecure non-local auth URLs, malformed/wildcard trusted origins, and provider/client errors containing credentials must fail without echoing values. Server-only modules must cause a client import violation rather than bundling bindings or signing code.

Native limiter failure cases recorded before implementation: missing bindings on public hosts must return 503, binding exceptions must return 503, negative decisions must return 429 with Retry-After, and localhost requests without bindings retain the existing scoped limits. IP rotation through untrusted forwarding headers must not change the native key. Binding success must preserve the original route/handler path.

Request logging failure case before implementation: an Effect defect bypasses `Effect.result`, so a server-function request can terminate without its completion event. Both typed failures and defects must emit one redacted completion event and rethrow the original cause.

Provider logging failure case before implementation: Better Auth's default logger bypasses the application logger and can print raw adapter errors. Its callback must record a fixed diagnostic event with severity, without forwarding message or arguments.

Session failure serialization review: the Better Auth Effect adapter includes raw provider messages and a cause on API errors. Session-read failures must remain failures, rather than become anonymous users, and must cross server-function boundaries with fixed public text only.

## Comparison and decisions

Source commit: `1c273c36b72f7fd9d4f867aece3d1787dcffae68`. Toolchain checkpoint integrated locally as `dc7d5d01a623a16acd1204dcc506c195384ed42a` from coordinator commit `75af3d7b90d9fa1f83907fa40e229d64d8eb56f0`. Dependency manifests and lockfiles remain toolchain-owned.

| Area                        | Starter evidence                                                                                         | Hexwardens finding and disposition                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth HTTP boundary          | `packages/auth/src/index.ts`, `apps/web/src/lib/server/auth-http.ts`, `auth-request-guard.ts`            | Form actions called internal API methods without HTTP origin/IP context or HTTP throttling. They now forward JSON through the singleton Better Auth HTTP handler, preserving request headers and Set-Cookie redirects. Failure redirects contain fixed application copy.                                                                                                                                                                                       |
| Trusted proxy identity      | `packages/rate-limit/src/index.ts::clientKey`, `packages/auth/src/index.ts::advanced.ipAddress`          | Both Hexwardens limiters trusted attacker-supplied forwarding headers when Cloudflare identity was missing. They now use only CF-Connecting-IP and share the unidentified bucket. Better Auth uses the same trusted header.                                                                                                                                                                                                                                    |
| Distributed abuse control   | `packages/rate-limit/src/index.ts::makeRateLimiter`                                                      | Starter uses native Cloudflare rate-limit bindings with an observable memory fallback. Hexwardens now calls WEB_RATE_LIMITER for auth/server functions and GAME_RATE_LIMITER before API/WS routing. Native denial returns 429; unavailable remote protection returns 503. Local fallback requires both a loopback URL and provider configuration allowing only local origins. Existing route-specific limits remain. Infra provisions the bindings separately. |
| CSRF and response headers   | `apps/web/src/start.ts`                                                                                  | Explicit Start CSRF middleware is installed for server functions alongside private/no-store, nosniff, DENY framing, referrer policy, and a limited CSP covering framing, base URLs and objects. Better Auth retains its own CSRF/origin checks. The game edge preserves CORS Vary dimensions and adds private/no-store/nosniff without reconstructing 101 responses.                                                                                           |
| Environment validation      | `packages/env/src/server.ts`, `trusted-origin.ts`, `transport.ts`, `apps/web/src/lib/server/env-gate.ts` | Added Effect configuration validation for Better Auth secret length and explicit HTTPS origins, allowing HTTP only on loopback hosts. Invalid values never appear in error text. Existing game env Config/Redacted boundary remains; deploy-time origin/secret enforcement belongs to infra.                                                                                                                                                                   |
| Error and telemetry privacy | `packages/logger/src/sanitization.ts`, `packages/failure/src/index.ts`                                   | Hexwardens copied exception messages/stacks into logs and client URLs into browser-error telemetry. Error diagnostics now retain safe error names, event/request context and timings. Browser reports retain occurrence/source only. Better Auth provider diagnostics go through the structured Effect logger without raw arguments. Token-mint failures use fixed public text.                                                                                |
| Request lifetime            | `apps/web/src/start.ts`, `packages/logger/src/invocation.ts`                                             | Retained the existing per-isolate Auth runtime and per-request ServerContext. Completion logging now uses onExit so defects cannot bypass the canonical server-function event. No new singleton request objects or cross-request I/O.                                                                                                                                                                                                                          |
| Server/client imports       | Starter server modules and Start middleware                                                              | Added Start server-only markers to auth/config/runtime, signing, server context and scoped rate-limit modules. Form/server-function modules remain callable client stubs. Build checks must retain Start import protection.                                                                                                                                                                                                                                    |
| JWT and websocket admission | `apps/web/src/lib/server/assistant-conversation-socket.ts` is application-specific                       | Existing game server already verifies signatures, match membership, schema-decodes socket messages, limits frames and preserves hibernation metadata. Fixed extra-segment acceptance, unchecked base64 decode defects, missing JWT header validation and inclusive expiry boundary. No game dispatch, fog filtering or state transition changes.                                                                                                               |
| Capability/DB architecture  | `packages/capabilities/AGENTS.md`, `packages/failure/src/capability.ts`, `packages/db`                   | Hexwardens already uses Effect DB services, parameterized Drizzle reads, authenticated saved-match ownership and atomic conditional writes. HttpApi capture maps DB errors to opaque InternalError. No SaaS capability framework or DB schema transplant is warranted.                                                                                                                                                                                         |
| Dependency compatibility    | Published `effectful-better-auth@1.0.3/dist/{mount,middleware}.{js,d.ts}`                                | Prepared a narrow pnpm patch changing removed Effect HTTP import paths to the stable rc paths. Coordinator owns patchedDependencies and lockfile registration. Auth/config/request code uses the upgraded TaggedError and Config APIs; owned server functions use Start’s current validator method.                                                                                                                                                            |

## Exclusions and tradeoffs

- No organizations, impersonation, SSO, OAuth consent, passkeys, billing permissions or MFA recovery flows were added. Those starter guards depend on SaaS authority models that Hexwardens does not have.
- No OAuth token encryption setting was added because this app enables username/email/password authentication and stores no OAuth provider tokens. Better Auth secure HttpOnly/SameSite cookie defaults and authoritative D1 session reads are retained; cookie caching was not introduced.
- No mandatory verified-email flow or password-reset delivery was copied. There is no configured mail delivery workflow here; adding either would change account/product behavior and requires its own implementation.
- No global quota claim: Cloudflare counters are per location and eventually consistent. Existing per-isolate scoped limits are an additional brake. Neither is a billing-grade global counter.
- Starter's missing-binding fallback was deliberately tightened for public requests. A missing protection binding is a deployment error, not a reason to accept unlimited distributed traffic.
- No full script-src CSP or COOP/COEP policy was imposed. React hydration, dev tooling and WebGL need runtime validation before those directives can safely change. The shipped limited CSP protects framing/base/object injection without blocking existing inline scripts.
- Websocket bearer TTL and query-token transport remain unchanged because reconnect currently reuses a token for the match lifetime. Application request logs exclude query strings. Revocation during an already-authorized match and Cloudflare platform access-log retention are separate operational concerns.
- Logging intentionally loses arbitrary exception prose and browser stack text. Safe event names, status, request paths and span timings remain; private credentials must not depend on a regex redactor guessing message syntax.
- No new shared logger/auth/failure package was created. Existing application ownership is retained, including two small native limiter adapters so web does not import the game Worker or add a gameplay dependency.
- No production deploys, secrets changes, package manifest edits, gameplay changes, visual UI changes or PR publication were performed in this slice.

## Current upstream references

Checked 2026-09-28 against official documentation and the installed target package source.

- [TanStack Start middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware) documents explicit CSRF middleware when defining a custom Start instance.
- [TanStack import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection) documents server-only markers.
- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit) documents trusted client-IP headers, HTTP rate limits and endpoint-specific rules.
- [Cloudflare rate limiting bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) documents native limit calls and per-location counters.

## Validation

Before fixes, regression tests demonstrated accepted extra JWT segments, accepted unsupported JWT headers, an untyped invalid-base64 defect, spoofed-header limiter bypasses, dropped CORS Vary dimensions and missing completion logs for defects. New config, native-binding and redaction boundary suites were written before their implementation. Existing browser auth tests are retained and extended with private response-header and cross-site native-form assertions.

Baseline dependency validation passed web 326 tests, game-server 194 tests and game-logic 761 tests before the target dependency checkpoint. Target dependency results:

- Complete web suite: 45 files, 333 tests passed with the registered compatibility patch.
- Complete game-logic suite on upgraded dependencies: 70 files, 761 tests passed.
- Game-server security, real D1 API and observability suites: 9 files, 72 tests passed using the infrastructure worker’s Miniflare 5 fixture.
- Changed-file type-aware lint passed, including the final 38 TypeScript files; changed-file formatting passed across 41 source/document files.
- Production web build passed with Start import protection. Client output contains no application JWT-secret identifier, Auth.readConfig or token-signing implementation. Better Auth's client dependency still contains its generic BETTER_AUTH_SECRET environment-getter name; this is not an embedded configured secret.
- Full workspace typecheck was executed and stopped on existing game-logic strict-indexing errors; separate web/game-server typechecks also remain blocked by unrelated strict/API migration errors. No errors remain in changed auth/config/Start/request/logger code. The Drizzle peer-instance mismatch also affects existing saved-match functions and needs dependency deduplication.
- Full repository lint was executed and found 571 errors during the in-progress strict migration, with the two new limiter annotation errors subsequently fixed. Full format check found three untouched files: generated game-server worker types, saved-match functions and the game route.
- Authentication browser suite: all 14 Chromium tests passed, covering existing signup/signin/session/logout flows plus private headers, cross-site refusal and native-form credential throttling. The final run passed and exited cleanly in 32.9 seconds with explicit graceful server shutdown. The first run needed its orphaned local Vite child terminated after tests finished; Playwright then exited successfully.

The upgraded configuration initially exposed unrelated existing strict TypeScript errors in game logic, visual UI, multiplayer fixtures and Drizzle peer identity; those belong to the coordinator's other migration slices. No compiler flag was weakened here. The commit omits the full-repository autofix hook because it changes unrelated migration files; scoped format/lint checks were run directly, and the failing global checks are recorded above.

Repeatable commands after integrating the coordinated toolchain and auth patch:

```sh
pnpm -C apps/web test
pnpm -C apps/game-server test
pnpm -C packages/game-logic test
pnpm -C apps/web test:e2e e2e/auth.spec.ts
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

Browser validation requires local Miniflare/Playwright sockets and the infrastructure worker's Miniflare 5 adapters. The standard two-server Playwright setup is blocked at game-server startup by an unrelated removed `Schedule.both` call; authentication was therefore validated with a temporary web-only config on isolated port 3019. To reproduce the focused run, extend `apps/web/playwright.config.ts` in a temporary file in the same directory with these overrides, then run `pnpm -C apps/web exec playwright test --config security-playwright.config.ts e2e/auth.spec.ts`:

```ts
import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
	...config,
	use: { ...config.use, baseURL: 'http://localhost:3019' },
	webServer: {
		command: 'pnpm exec vp dev --port 3019',
		url: 'http://localhost:3019',
		reuseExistingServer: false,
		timeout: 120_000,
		gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
		env: {
			GAME_SERVER_URL: 'http://127.0.0.1:8787',
			HEXWARDENS_USE_WORKERS_SHIM: '1',
			HEXWARDENS_USE_WORKERS_SHIM_MEMORY: '1',
			BETTER_AUTH_URL: 'http://localhost:3019',
			BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:3019',
			BETTER_AUTH_SECRET: 'local-security-browser-test-secret-only',
			AUTH_JWT_SECRET: 'local-security-browser-test-signing-only',
			HEXWARDENS_DISABLE_RATE_LIMIT: '1'
		}
	}
})
```

These disposable test secrets are not production credentials. The scoped gameplay bypass does not disable Better Auth's credential limiter or the new platform adapter tests. The temporary config and borrowed infrastructure adapters are excluded from the security commit; after integrating all migration slices, rerun the standard two-server suite.

The package patch was registered and installed through a temporary copy of the coordinator's dependency files for validation. Those borrowed manifest/lockfile changes are excluded from this slice.
