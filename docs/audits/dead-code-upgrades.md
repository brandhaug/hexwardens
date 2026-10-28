# Dead-code regression gate audit

## Failure cases recorded before configuration

A missing baseline must refuse the regression check. An added unused file, unused export, unused dependency, unlisted dependency or unresolved import must fail the gate. Source parse failures must not silently reduce the graph. Ordinary source renaming must not require path-based baseline churn. Configuration must distinguish runtime entries from deployment/build tools and must not hide findings behind broad rule suppression. Compare findings against original commit `55334e3b9344ca7f856d897886108685b6730556`, rather than accepting today's count without inspecting deltas.

## Method and scope

Used the installed, signature-verified Fallow **3.30.0**, its CLI help, [configuration reference](https://fallow.tools/docs/configuration/overview/), [global flags](https://fallow.tools/docs/cli/global-flags/), and [detection internals](https://github.com/fallow-rs/fallow/blob/main/docs/reference/detection-internals.md). Version remains pinned by the tooling owner; this change sets `minimumVersion` and does not modify dependencies. All machine scans used JSON stdout, separate stderr, preserved exit status, and disabled incremental caches. No telemetry or automatic source fixes were run.

Compared a read-only `git archive` of the original commit against a temporary snapshot of the coordinator's current checkout, including its uncommitted integration changes. The initial parent HEAD was `53dd596e73a6bf2182b9da4fe6e76cf6c866694e`; the final snapshot additionally includes strict filename migrations, UI integration and dead-code cleanup. The worker commit base is `6604d5747f27cd4c31fc90046d7f5a28d6c36c6e`.

Secret environment files were excluded by name without reading their contents. Each snapshot had local `@hexwardens/*` workspace links resolving into that snapshot. Both used the current installed external packages, so this comparison isolates source/configuration differences, not historical dependency installation behavior. An archive without workspace links falsely reports cross-package exports as unused; those degraded scans were discarded.

Only `.fallowrc.json` and this report are owned by this checkpoint. Source, manifest and script corrections below were sent to the coordinator. Final temporary validation applied the agreed `build` → `build-structure` rename and tested dev script correction while the coordinator's E2E run prevented edits to its live checkout.

## Differences and disposition

With the inherited configuration, both original and initial current sources reported **12** issues. Equal totals hid four new Vite+ configuration false positives offset by four removed catalog findings. Findings were compared by identity before setting any baseline.

| Finding                                         | Original / initial current evidence                                                                                                                                                | Disposition                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Vite+ config file and `lintConfig` export       | Current `lint.config.ts`, imported by root `vite.config.ts`, was not reached                                                                                                       | Explicit Vite+ support entry for `vite.config.ts`; follows the actual import                                                               |
| Vite+ lint dependencies                         | `eslint-plugin-better-tailwindcss`, `ultracite` are loaded by config strings in `lint.config.ts`                                                                                   | Declare these two tooling dependencies in the Vite+ adapter                                                                                |
| Deployment dependencies reported in production  | Root `alchemy.run.ts` imports Alchemy and Effect; inherited `dynamicallyLoaded` classified deployment as runtime                                                                   | Alchemy support entry, no production dependency promotion                                                                                  |
| Asset tools                                     | `tools/convert-kaykit-asset.ts` invokes glTF CLI/pipeline; ADR 0006 documents the workflow                                                                                         | Tools are support entries, with exactly those two tooling dependencies; `tools/check-tri-counts.ts` now imports Effect and remains tooling |
| Unused separator                                | `apps/web/src/components/ui/separator.tsx` had no consumers, already present at original commit                                                                                    | Coordinator removed it                                                                                                                     |
| Unused type re-export                           | `apps/web/src/lib/game-client.ts` re-exported `FilteredGameState` without consumers of that re-export                                                                              | Coordinator removed re-export; canonical domain type remains                                                                               |
| Building mapping reported unused                | Original `domains/secondaryBuilding.ts`, now `domains/secondary-building.ts`, exports `primaryBuildingToSecondaryBuilding`; `actions/features/build-structure/plan.ts` consumes it | Scanner discovery false positive, never baseline as dead code; coordinator renames directory to `build-structure`                          |
| Unused dependencies hidden by inherited ignores | Root `@effect/platform-bun`, `@effect/platform-node`; web `nitro`                                                                                                                  | Bun platform removed during modernization; coordinator removed direct node platform and Nitro dependencies/catalog pins after this audit   |
| Stale source suppressions                       | One `unresolved-import` comment in `apps/web/src/index.css`, two `unused-class-member` comments in `audio/audio-manager.ts`                                                        | Coordinator removed all three                                                                                                              |
| Unused original catalog entries                 | `bun-types`, `culori`, `image-js`, `zod`                                                                                                                                           | Already eliminated by catalog migration                                                                                                    |
| Duplicate export names                          | React `Board` versus domain `Board`; transport `decodeClientMessage(codec, raw)` versus wire `decodeClientMessage(raw)`                                                            | Re-enable duplicate detection; exempt only UI Board and transport-wrapper decodeClientMessage by exact file/export                         |

After replacing inherited broad ignores with the explicit adapters, the original revision reports **13** findings: one unused file, one falsely unused building mapping, one unused type, three unused dev dependencies, three stale suppressions and four unused catalog entries. The initial upgraded snapshot reports **8**: the same three declaration findings, two unused dev dependencies and three stale suppressions. After the coordinator's cleanup and discovery correction, the final snapshot reports **0**, including zero unlisted dependencies and unresolved imports.

## Configuration decisions

- Remove the entire inherited `ignoreDependencies` list. CSS imports, shadcn configuration and normal imports provide evidence for the remaining packages; only actual CLI/config-string consumers need tooling declarations.
- Replace the global `duplicate-exports: off` rule with the two exact exemptions above. These names represent different contracts, not redundant implementations. These exemptions also exempt those specific names from unused-export reporting, a deliberate limited tradeoff to avoid disabling duplicate detection everywhere.
- Remove unscoped `update`, `isAdjacentToBuilding` and `perimeterSides` class-member exemptions; doing so introduces no findings. Preserve host-invoked method exemptions scoped to classes extending `DurableObject`.
- Retain dynamically loaded wiki MDX, PWA configuration, local Workers shim and test setup. Mark Alchemy and asset tools as support entries rather than runtime entries.
- Enable `failOnParseError`; minimum supported analyzer version is 3.30.0.
- Embed a CLI-generated **zero-count** `regression.baseline` in `.fallowrc.json`. No separate baseline file, `ignoreFindings`, severity overrides, category disablements or tolerance increase. Normal error-severity gates remain active.

Fallow's regression check compares total counts, not finding identities. A nonzero baseline could mask replacement of one warning with another or improvements offsetting regressions. A zero baseline avoids that allowance: every counted finding fails, including warnings. Do not regenerate the baseline to make a failing run green. Inspect each finding and fix code or document a precise host/framework contract first.

## Discovery and script-parser limitations

Fallow 3.30.0 excludes `**/build/**` before entry selection. Explicit `entry`, `dynamicallyLoaded`, and negated `ignorePatterns` were each tested separately for the original `packages/game-logic/src/actions/features/build/plan.ts`; all still emitted `excluded-by-default-ignore`. Its diagnostic explicitly says built-in ignores cannot be switched off. Moving the source directory to `build-structure` restores discovery and removes the false unused mapping finding without an export exemption. Future first-party source should avoid scanner-reserved output directory names; inspect `--explain-skipped` on layout changes.

The inherited `dev:e2e` package script's `${HEXWARDENS_WRANGLER_PERSIST_TO:-../../.wrangler-dev/state}` is incorrectly parsed as an entry ending in `state}`, causing an invalid glob. Quoting the expansion or moving that same expansion into an export does not fix it. There is no supported config key to disable this individual package-script entry. The tested narrow correction starts the script with:

```sh
if [ -z "$HEXWARDENS_WRANGLER_PERSIST_TO" ]; then
  export HEXWARDENS_WRANGLER_PERSIST_TO=../../.wrangler-dev/state
fi
```

Both existing Wrangler invocations then use `--persist-to "$HEXWARDENS_WRANGLER_PERSIST_TO"`; keep their `&&` connection and existing auth/rate-limit arguments. A fake Wrangler executable proved unset and empty values retain the old default, custom paths containing spaces remain one argument, and a migration failure prevents the dev command. No real Wrangler command was used for these tests.

Fallow still warns that three apparent package-script entries containing `../../.wrangler-dev/state` are outside the root. These are storage paths, not source entrypoints; after the correction there is no malformed glob. This remaining parser warning is recorded rather than silenced. Boundary/policy counts are also zero because no architecture boundaries or rule packs are configured; the dead-code gate is not an architecture/security-policy audit.

## Validation and reproduction

From the integrated checkout with installed workspace links and the coordinator's discovery/script corrections:

```sh
pnpm exec fallow dead-code --format json --quiet --no-cache \
  --fail-on-regression --explain-skipped \
  > /tmp/hexwardens-dead-code.json 2> /tmp/hexwardens-dead-code.stderr
```

Expected: exit **0**, `total_issues: 0`; `error-severity-findings`, `regression`, and `parse-error` gates all pass. Root `pnpm run dead-code` invokes the same regression gate. The recorded zero baseline needs no regeneration after filename changes. If auditing a baseline deliberately, `pnpm exec fallow dead-code --save-regression-baseline --format json --quiet` writes the counts into configuration; review its diff and findings before committing.

Negative probes ran against a disposable fully linked snapshot, restoring each edit before the next. The following edits and command above reproduce the checks; never inject them into a shared checkout.

| Probe                      | Temporary edit                                                                 | Result                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Missing baseline           | Remove `regression` from the config                                            | Exit 2, refuses missing baseline                                                 |
| Unused file                | Add `apps/web/src/lib/fallow-regression-probe.ts` exporting an unused constant | Exit 1; total 1; regression fails                                                |
| Unused export              | Append `export const regressionProbe = 1;` to `domains/secondary-building.ts`  | Exit 1; total 1; regression fails                                                |
| Unused dev dependency      | Add `fallow-regression-probe: 1.0.0` to root devDependencies                   | Exit 1; total 1; ordinary severity gate passes, regression fails                 |
| Unresolved relative import | Prepend `import "./fallow-regression-missing";` to web `router.tsx`            | Exit 1; total 1                                                                  |
| Unlisted package           | Prepend `import "fallow-regression-unlisted";` to web `router.tsx`             | Exit 1; total 1                                                                  |
| Parse failure              | Append `export const = ;` to web `router.tsx`                                  | Exit 1; parse-error gate identifies router; degraded graph also reports 3 issues |
| Restore all probes         | Restore the snapshot files exactly                                             | Exit 0; total 0; all three gates pass                                            |

The unused-dev-dependency probe proves count enforcement independently of ordinary error severity. Runtime tests and production builds were not repeated for this config/report-only checkpoint; the coordinator owns full integrated validation and independent review. No source/manifests, gameplay behavior, secrets or deployment state were changed by this checkpoint.

At handoff, a read-only scan of the live parent using this config still exits **1** with only the falsely unused building mapping and the old malformed script glob: the coordinator deferred those two edits until its E2E run finishes. This is the expected integration dependency, not an accepted baseline allowance. The fully linked temporary snapshot with precisely those two corrections exits **0**. Run the command above once the parent applies them; retain the zero baseline. Scoped formatter checks and `git diff --check` pass. The worker checkout still contains older application/toolchain sources, so its full-repo hook is not representative of the integrated source snapshot and was bypassed for this two-file checkpoint.
