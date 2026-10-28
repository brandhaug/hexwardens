# Toolchain upgrade audit

Audited 2026-09-28. Hexwardens base: `55334e3b9344ca7f856d897886108685b6730556`.
Starter reference: `1c273c36b72f7fd9d4f867aece3d1787dcffae68` in `/Users/brandhaug/IdeaProjects/b2b-saas-starter`.

## Differences and applicability

| Area                   | Starter evidence                                                            | Hexwardens baseline                                              | Decision                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Package manager        | `package.json`, `pnpm-workspace.yaml`, `.node-version`                      | Bun 1.3.14, root JSON catalog, no Node pin                       | Port pnpm workspace catalog, lockfile and Node pin; verify registry versions rather than copy older starter pins.    |
| Task orchestration     | Root `vite.config.ts` and scripts use Vite+                                 | Turbo plus separate Vite, Vitest, Oxlint and Oxfmt               | Replace Turbo with Vite+ tasks, retain full lint policy and formatter settings.                                      |
| Commit hook            | Root `vite.config.ts` staged formatter                                      | `.githooks/pre-commit` formats and lints all files then restages | Keep explicit checked-in hook and existing checks while replacing Bun commands.                                      |
| TypeScript             | `tsconfig.base.json` enables exact optional properties and checked indexing | Five duplicated configs, neither check enabled                   | Centralize shared compiler options and assess strict migration errors. Keep game logic free of DOM and Worker types. |
| Validation             | Root `check`, `validate`, `dead-code`, recursive `test` scripts             | No combined check or test command                                | Add composed checks; preserve all test suites. Infra and CI changes belong to their assigned workers.                |
| Version ownership      | Catalog includes Wrangler, Worker types, Alchemy and Effect                 | Several inline versions drift from root catalog                  | Centralize every direct version and upgrade against npm metadata.                                                    |
| Runtime scripts        | Node TypeScript scripts and pnpm commands                                   | Bun commands in hooks, Playwright and worktree setup             | Remove the runtime dependency on Bun from setup and validation.                                                      |
| Cloudflare integration | Native Workers Vite integration                                             | Workers shim and older Miniflare                                 | Owned by infra worker; keep config changes limited to toolchain until integration.                                   |
| Lint strictness        | `lint.config.ts`, custom plugins, fallow baseline                           | Small `.oxlintrc.json`                                           | Preserve current policy in Vite+; stricter policy and baseline owned by later lint worker.                           |

## Current upstream evidence

- [Vite+ migration guide](https://viteplus.dev/guide/migrate) and [migration rules](https://viteplus.dev/guide/migrate-rules): migrate all workspaces, alias Vite to the matching core, retain a single bundled Vitest version and explicitly review compatibility defaults.
- [Vite+ Vitest 5 migration](https://viteplus.dev/guide/vitest-v5): Vite+ 1.0 changes runner defaults; test compatibility needs validation.
- npm registry metadata was queried for every direct/catalog dependency on the audit date. Vite+ latest is 1.0.0, pnpm latest 12.6.0, Effect rc tag 4.0.0-rc.118, Alchemy latest 2.0.0-beta.79. Drizzle has a newer `rc5` tag than its `rc` and `beta` tags; avoid accidentally downgrading the existing release candidate to beta.

## Implementation and validation

Checkpoint evidence, before owner integration:

- `pnpm install` passes with pnpm 12.6.0. Explicit build allowlist permits esbuild, workerd and sharp; skips core-js and MSW setup scripts. `autoInstallPeers: false` prevents new implicit peer additions. A fresh isolated lockfile resolution was also required to collapse the migrated Drizzle peer identities; `pnpm dedupe` alone retained the incompatible copies.
- `pnpm -C packages/game-logic test`: 70 files and 761 tests pass under Vite+ 1.0.0 / Vitest 5.0.1.
- `pnpm run typecheck`: fails with 259 game-logic errors in 38 files after fixing Effect API renames. These are the newly enabled indexing/optional-property checks; coordinator owns the follow-up strict-source migration. Flags remain enabled.
- `pnpm -C apps/web test`: 9 auth/server-context tests currently fail pending owner compatibility fixes; all failures are reported, not skipped.
- `pnpm run lint`: newer bundled React rules expose existing ref/render and synchronous-effect-setState issues, alongside owner-pending Effect API fixes. Coordinator owns lint policy/source follow-up.
- `pnpm run format:check`: initial 16 files required formatting with newer Oxfmt; formatter applied before checkpoint.
- `pnpm peers check`: narrow declared-range mismatches remain for capnp-es/TypeScript 7, Storybook/Vite+ 1.0 and vite-plugin-pwa/assets-generator 2. Builds must establish actual compatibility before deciding pins.

Mechanical compatibility changes rename `Schema.TaggedErrorClass` to `Schema.TaggedError`, replace Effect unstable module paths with stable paths, read `SchemaError.issue` when extracting fog-validation paths, and remove the deleted Drizzle `schema` option from D1 construction. Existing schema exports remain unchanged and Better Auth supplies its own adapter schema.

The official migrator added `clearMocks: false` to preserve Vitest 4 behavior in all three suites. Removed it from game-logic after all 761 tests passed with the Vitest 5 default; retained it in web/server because their owner-pending failures prevent a clean baseline. Its bot-pacer unawaited-assertion review is a false positive: the assertion promise is saved and awaited after aborting the controller.

Vite+ owns bundled Vitest 5.0.1, Oxlint 1.85.0, Oxfmt 0.70.0 and @oxlint/plugins 1.79.0; independent newer releases cannot be substituted without breaking the supported toolchain combination. Removed obsolete Turbo, Bun platform adapter, native-preview, standalone formatter/linter and unused catalog entries. Infrastructure scripts point to the coordinator-assigned infra work; they are pending that slice's integration.

Automatic approval review rejected coordinator-requested lint-policy dependency additions as outside original ownership, even after presenting the follow-up assignment. Those additions were not made; coordinator was notified to handle them in its checkout.

## Follow-up implementation

- Replaced `@effect/language-service` with `@effect/tsgo` 0.46.1. The older CLI explicitly rejects TypeScript 7; [the official native tool](https://github.com/Effect-TS/tsgo) supports TypeScript 7.0.2 and the Vite+ bundled Oxlint versions. Workspace typechecks still run the compiler and strict Effect diagnostics; existing plugin options remain recognized. Standalone API diagnostics execute successfully, with informational schema-number suggestions.
- Replaced removed `Schedule.both(Schedule.recurs(3))` with `Schedule.upTo({ times: 3 })`. The 100 ms exponential retry policy still permits three retries. Full persistence tests remain blocked by the infra-owned Miniflare fixture migration.
- Ported client strictness fixes assigned by the coordinator: traverse board rows through entries, guard story/test fixtures, preserve branded unit IDs through typed entries, normalize absent selections to null, omit absent optional protocol fields, and state the existing forwarded-undefined React prop contracts explicitly. Missing rig assets now throw at the renderer boundary rather than dereferencing undefined. No gameplay dispatch, fog filtering, random source, or saved-game format changed.
- Corrected PWA output from `.output/public` to `dist/client`. Vite's [post-buildApp hook](https://main.vite.dev/guide/api-environment-frameworks) invokes the PWA plugin API after Start finishes both environments; the plugin's legacy closeBundle path skipped generation under SSR. The verified output contains `dist/client/sw.js` and `dist/client/workbox-8e572d62.js`, with 83 precache entries. Client-side registration remains unchanged.
- Root `check` now composes typecheck, lint, formatting, dead-code and all workspace tests. `validate` adds builds, the infra-owned configuration check, local migrations and existing Playwright tests. Infra scripts and the fallow baseline require the other slices before this complete command can pass.

## Final validation and integration boundaries

| Command                                                                           | Observed result in this worker checkout                                                                                                                                                            |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                  | Pass with pnpm 12.6.0 and Node 24.21.0.                                                                                                                                                            |
| Fresh temporary manifest-only `pnpm install --lockfile-only --ignore-scripts`     | Pass; resulting lockfile installs frozen in the workspace and resolves one Drizzle identity.                                                                                                       |
| `pnpm run format:check`                                                           | Pass.                                                                                                                                                                                              |
| `pnpm -C packages/game-logic test`                                                | 70 files, 761 tests pass with default Vitest 5 mock behavior.                                                                                                                                      |
| `pnpm -C apps/web test`                                                           | 38 files pass, 300 tests pass; nine tests in two auth/server-context files fail because published effectful-better-auth imports deleted Effect paths. Security/coordinator owns the package patch. |
| `pnpm -C apps/game-server test`                                                   | 11 files pass, eight fail; 128 tests pass and 41 fail, with additional suite-load failures. Miniflare 5 requires workers-array options, and auth/request Effect APIs remain owner-pending.         |
| `pnpm run build`                                                                  | Both game-server dry-run build and web client/server build pass. No deployment performed.                                                                                                          |
| `pnpm -C apps/web build` after PWA fix                                            | Pass; service worker and Workbox files verified on disk.                                                                                                                                           |
| `pnpm exec effect-tsgo diagnostics --project packages/api/tsconfig.json --strict` | Pass; informational schema suggestions emitted.                                                                                                                                                    |
| `pnpm -C apps/web exec tsc --noEmit --pretty false`                               | Owned UI/client/config errors cleared. Fails on imported game strictness and auth/Miniflare boundaries assigned to other owners.                                                                   |
| `pnpm run typecheck`                                                              | Fails on 259 game-logic strictness errors in 38 files, assigned to coordinator. No flags disabled.                                                                                                 |
| `pnpm run lint`                                                                   | Fails on existing/new strict React findings, remaining owner API errors and compiler errors. Coordinator owns policy and final lint repairs.                                                       |
| `git diff --check`                                                                | Pass before final formatting and commit.                                                                                                                                                           |

Browser/E2E verification is deferred until the auth and Workers integration slices land; the local runtime is currently blocked by their documented API incompatibilities. The PWA build checks prove generated artifacts, not browser offline behavior. Storybook declares an older Vite+ peer range, capnp-es declares TypeScript 5/6, and vite-plugin-pwa declares assets-generator 1.x; no blanket peer suppression was added for these. The production build and PWA generation succeed, while a full Storybook run remains for integrated verification.

Automatic approval review also rejected the proposed import-only patch to effectful-better-auth as outside this worker's security ownership. The coordinator assigned that patch to the security owner and reported it applied in its integration checkout. Neither blocked action was bypassed here.

## Direct dependency inventory

All retained direct versions are centralized in `pnpm-workspace.yaml`, including previously inline Worker types, Three types, Wrangler and Alchemy pins. Registry lookup date is 2026-09-28. Stable latest tags are used except the existing Effect v4 prerelease family and Drizzle v1 release-candidate line, plus the matching Vite+ core/Vitest bundle. Unused catalog entries were removed instead of installing unused dependencies.

| Package                            | Before            | Selected                                 |
| ---------------------------------- | ----------------- | ---------------------------------------- |
| `@base-ui/react`                   | `1.4.0`           | `1.8.0`                                  |
| `@cloudflare/workers-types`        | `4.20260422.1`    | `5.20260928.1`                           |
| `@dagrejs/dagre`                   | `3.0.0`           | `3.1.1`                                  |
| `@effect/atom-react`               | `4.0.0-beta.58`   | `4.0.0-rc.118`                           |
| `@effect/tsgo`                     | `new`             | `0.46.1`                                 |
| `@effect/platform-node`            | `4.0.0-beta.58`   | `4.0.0-rc.118`                           |
| `@effect/vitest`                   | `4.0.0-beta.58`   | `4.0.0-rc.118`                           |
| `@fontsource-variable/cinzel`      | `5.2.8`           | `5.3.0`                                  |
| `@fontsource-variable/crimson-pro` | `5.2.8`           | `5.3.0`                                  |
| `@gltf-transform/cli`              | `4.3.0`           | `4.5.0`                                  |
| `@mdx-js/rollup`                   | `3.1.1`           | `3.1.1`                                  |
| `@playwright/test`                 | `1.48.2`          | `1.63.0`                                 |
| `@react-three/drei`                | `10.7.7`          | `10.7.9`                                 |
| `@react-three/fiber`               | `9.6.1`           | `9.8.1`                                  |
| `@storybook/react-vite`            | `10.3.6`          | `10.6.0`                                 |
| `@tailwindcss/typography`          | `0.5.19`          | `0.5.20`                                 |
| `@tailwindcss/vite`                | `4.2.2`           | `4.3.3`                                  |
| `@tanstack/devtools-vite`          | `0.6.0`           | `0.8.5`                                  |
| `@tanstack/react-devtools`         | `0.10.2`          | `0.10.13`                                |
| `@tanstack/react-form`             | `1.29.0`          | `1.33.5`                                 |
| `@tanstack/react-query`            | `5.99.0`          | `5.104.0`                                |
| `@tanstack/react-query-devtools`   | `5.99.0`          | `5.104.0`                                |
| `@tanstack/react-router`           | `1.168.23`        | `1.170.40`                               |
| `@tanstack/react-router-devtools`  | `1.166.13`        | `1.167.2`                                |
| `@tanstack/react-router-ssr-query` | `1.166.11`        | `1.167.3`                                |
| `@tanstack/react-start`            | `1.167.42`        | `1.168.59`                               |
| `@types/lodash-es`                 | `4.17.12`         | `4.17.12`                                |
| `@types/node`                      | `new`             | `26.6.3`                                 |
| `@types/react`                     | `19.2.14`         | `19.3.0`                                 |
| `@types/react-dom`                 | `19.2.3`          | `19.3.0`                                 |
| `@types/three`                     | `0.183.0`         | `0.186.0`                                |
| `@vite-pwa/assets-generator`       | `1.0.2`           | `2.0.0`                                  |
| `@vitejs/plugin-react`             | `6.0.1`           | `6.1.1`                                  |
| `@xyflow/react`                    | `12.10.2`         | `12.12.0`                                |
| `alchemy`                          | `2.0.0-beta.23`   | `2.0.0-beta.79`                          |
| `better-auth`                      | `1.6.2`           | `1.7.6`                                  |
| `class-variance-authority`         | `0.7.1`           | `0.7.1`                                  |
| `clsx`                             | `2.1.1`           | `2.1.1`                                  |
| `drizzle-kit`                      | `1.0.0-rc.2`      | `1.0.0-rc.5-5935859`                     |
| `drizzle-orm`                      | `1.0.0-rc.2`      | `1.0.0-rc.5-5935859`                     |
| `effect`                           | `4.0.0-beta.58`   | `4.0.0-rc.118`                           |
| `effectful-better-auth`            | `0.1.1`           | `1.0.3`                                  |
| `fallow`                           | `2.56.0`          | `3.30.0`                                 |
| `gltf-pipeline`                    | `4.3.1`           | `4.3.1`                                  |
| `honeycomb-grid`                   | `4.1.5`           | `4.1.5`                                  |
| `lodash-es`                        | `4.18.1`          | `4.18.1`                                 |
| `lucide-react`                     | `1.8.0`           | `1.48.0`                                 |
| `miniflare`                        | `4.20250507.0`    | `5.20260926.0-alpha`                     |
| `nitro`                            | `3.0.260311-beta` | `3.0.260903-beta`                        |
| `prando`                           | `6.0.1`           | `6.0.1`                                  |
| `react`                            | `19.2.5`          | `19.3.0`                                 |
| `react-dom`                        | `19.2.5`          | `19.3.0`                                 |
| `rehype-slug`                      | `6.0.0`           | `6.0.0`                                  |
| `remark-frontmatter`               | `5.0.0`           | `5.0.0`                                  |
| `remark-gfm`                       | `4.0.1`           | `4.0.1`                                  |
| `remark-mdx-frontmatter`           | `5.2.0`           | `6.0.0`                                  |
| `shadcn`                           | `4.2.0`           | `4.21.0`                                 |
| `sonner`                           | `2.0.7`           | `2.0.8`                                  |
| `storybook`                        | `10.3.6`          | `10.6.0`                                 |
| `tailwind-merge`                   | `3.5.0`           | `3.7.0`                                  |
| `tailwindcss`                      | `4.2.2`           | `4.3.3`                                  |
| `three`                            | `0.183.0`         | `0.186.1`                                |
| `three-stdlib`                     | `2.36.1`          | `2.36.1`                                 |
| `tw-animate-css`                   | `1.4.0`           | `1.4.0`                                  |
| `typescript`                       | `6.0.2`           | `7.0.2`                                  |
| `vite`                             | `8.0.9`           | `npm:@voidzero-dev/vite-plus-core@1.0.0` |
| `vite-plugin-pwa`                  | `1.2.0`           | `1.3.0`                                  |
| `vite-plus`                        | `new`             | `1.0.0`                                  |
| `vitest`                           | `4.1.4`           | `5.0.1`                                  |
| `workbox-window`                   | `7.4.0`           | `7.4.1`                                  |
| `wrangler`                         | `4.87.0`          | `4.142.0`                                |

The Vite+ transitive tool versions are a compatibility unit, not independent direct dependencies. Vitest 5.0.2, Oxlint 1.86.0 and Oxfmt 0.71.0 were available in the registry but were not substituted for Vite+ 1.0.0's exact bundle. pnpm 12.6.0 is pinned in packageManager; Node 24.21.0 is the supported LTS runtime pin.

## Final integration additions

The coordinator replaced the full-repository autofixing pre-commit hook with Vite+'s staged formatter, preserving partial staging. Full checks remain required locally and in CI. `tsconfig.repo.json` now covers root tooling/configuration, and the infrastructure workspace covers deployment scripts. Native Effect diagnostics are clean after finite domain-schema repairs.

A fresh `pnpm outdated -r --include-workspace-root --format json` on 2026-09-28 reports only Vitest 5.0.2 ahead of the bundled 5.0.1. Every other installed direct dependency is current according to that registry check, including the lint plugins added during integration. The bundled Vitest exception remains deliberate. Live transitive vulnerability scanning is recorded in the infrastructure audit.

## Integrated follow-up

Earlier failures in this report are checkpoint history. Integration resolves the strict compiler and Effect diagnostics, auth/Miniflare compatibility, lint migration, PWA generation and infrastructure wiring. Production and Storybook builds pass. Storybook now has a dedicated Vite config, excluding Start server/PWA lifecycles; its hidden config files are explicitly typechecked. This follows [Storybook’s custom Vite configuration mechanism](https://storybook.js.org/docs/builders/vite), with an actual config file for Vite+ compatibility. Unused direct `nitro` and `@effect/platform-node` dependencies were removed after graph analysis rather than retained at the intermediate versions in the table.

The final registry sweep reports only the documented bundled Vitest difference. The frozen pnpm install passes, and Fallow reports zero unused/unresolved dependency or export findings. See the integrated validation report for final browser and review results.
