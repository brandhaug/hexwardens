# Integrated starter upgrade validation

Audit date: 2026-09-28. Original Hexwardens revision: `55334e3b9344ca7f856d897886108685b6730556`. Reference starter: `1c273c36b72f7fd9d4f867aece3d1787dcffae68`.

The [audit matrix](starter-upgrade-audit.md) records applicability and implementation ownership. Three Orca worktrees implemented toolchain/UI, infrastructure/CI, and backend/security changes; the coordinator integrated strict engine contracts and quality gates. Earlier slice reports preserve intermediate failures. This report records integrated results and supersedes those checkpoint statuses.

## Reproducible checks

From the repository root with Node 24.21.0 and pnpm 12.6.0:

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run dead-code
pnpm run test
pnpm run build
pnpm -C apps/web run build-storybook
node infra/write-wrangler.ts --check
node scripts/check-shared-d1.ts
actionlint
pnpm outdated -r --include-workspace-root --format json
```

Observed at the integration checkpoint:

| Check                                    | Result                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Frozen install                           | Pass; lockfile unchanged                                                                       |
| Strict lint                              | Zero findings; 855 configured rules                                                            |
| TypeScript and native Effect diagnostics | Pass across all workspaces and repository scripts                                              |
| Formatter                                | Pass                                                                                           |
| Fallow                                   | Zero findings against a zero-finding baseline                                                  |
| Game logic                               | 767 tests pass, including deterministic and filtered-snapshot contracts                        |
| Web                                      | 353 tests pass                                                                                 |
| Game server                              | 210 tests pass                                                                                 |
| Local lint plugin                        | 55 tests pass                                                                                  |
| Infrastructure guards and encryption     | Six tests pass                                                                                 |
| Scanner regression probes                | 11 pass with real Gitleaks 8.30.1 and Trivy 0.74.0 binaries                                    |
| Production build                         | Pass; web SSR/client assets and PWA precache generated, Worker dry-run succeeds                |
| Storybook build                          | Pass with its independent component Vite configuration                                         |
| Generated binding drift and shared D1    | Pass, including legacy migration-ledger adoption without data loss                             |
| Actionlint                               | Pass                                                                                           |
| Live dependency vulnerability scan       | Pass with the configured high/critical policy                                                  |
| Registry freshness                       | Only bundled Vitest 5.0.1 differs from upstream 5.0.2; Vite+ 1.0.0 owns that supported version |

Scanner cases skip when their binaries are unavailable; an ordinary test run alone is not evidence that they ran. Reproduce the scanner result with `GITLEAKS_BINARY` and `TRIVY_BINARY` pointing to the verified binaries when running `pnpm run test:scripts`. Run `TRIVY_BINARY=/path/to/trivy node .github/scripts/run-trivy.ts .` for the lockfile policy. CI verifies scanner archive checksums before execution.

## Browser evidence

Use disposable local credentials from `.github/workflows/ci.yml` and run `CI=1 pnpm run test:e2e`. Playwright starts both local apps with fresh shared D1 state, applies migrations, and tears the servers down. No remote resources are touched.

The integrated suite covers 28 cases: credential flows and throttling, cross-site request rejection, private/manual/public multiplayer admission, ten offline bot turns, navigation, a composited WebGL board, and keyboard dialog focus/dismissal. The final local run passed all 28 cases with retries disabled. Investigation corrected three causes of unreliable results:

- Lazy board loading can suspend and hide the game after a dialog opens. Native focus is lost on hide. Dialog layout effects now reopen and focus the control when React reveals the game.
- WebGL's default framebuffer is cleared after presentation. The rendering smoke test samples a composited canvas screenshot instead of reading the cleared framebuffer between frames. Its 640 × 480 viewport limits software-GPU capture cost while preserving the horizontal color-variation assertion.
- The bot test could legitimately finish before turn ten. The fixture now fixes the board seed. Investigation also found that the production turn runner omitted its scoring RNG; it now injects Prando from the match seed, turn and tribe. A regression written before the repair demonstrated 54 ambient random calls; it now verifies identical replay output, no ambient randomness and unchanged input.

The dialog and rendered-board cases passed five repetitions each with retries disabled at the preceding checkpoint. The seeded production bot path passed three repetitions after its repair:

```sh
CI=1 pnpm -C apps/web exec playwright test --grep 'keyboard shortcuts focus|nonblank 3D' --repeat-each=5 --retries=0
CI=1 pnpm -C apps/web exec playwright test --grep 'offline /game route survives' --repeat-each=3 --retries=0
CI=1 pnpm -C apps/web exec playwright test --retries=0
```

Local evidence: `/private/tmp/hexwardens-e2e-reliability-final.log` records 10/10 passing cases; `/private/tmp/hexwardens-deterministic-bot-e2e.log` records 3/3; `/private/tmp/hexwardens-final-complete-e2e.log` records 28/28 without retries in 1.2 minutes on code revision `4fe2da8f`. `/private/tmp/hexwardens-delivery-e2e.log` records another 28/28 without retries after the auth-path repair and the bot viewport adjustment. Both the canvas and bot probes use 640 × 480 viewports; all gameplay and pixel assertions remain in place. Local execution used port 3109 because an unrelated app owned 3001: the temporary config copied `apps/web/playwright.config.ts`, changed web URL/baseURL and `BETTER_AUTH_URL` to `http://localhost:3109`, appended `--port 3109` to the web command, and appended `--var ALLOWED_ORIGIN:http://localhost:3109` to the game command. The repository CI configuration uses its normal dedicated ports.

## Independent review

Two fresh Orca Codex sessions reviewed the full original-base-to-`451a01baf2e31253ba182b55c97d194c2ad699d4` diff, separately covering Standards (including the thermo-nuclear maintainability pass) and Spec. Spec found no confirmed actionable omissions. Standards reproduced two P2 issues: a development flag bypassing scoped throttles on public hosts with healthy native protection, and provider diagnostics logging separately from their owning request. It also found stale architecture guidance. Those repairs passed the next independent full-diff review at `cb84c15a`. That review identified token-bearing native auth paths in completion and limiter logs, plus three stale guidance references. The path repair is integrated at `c3bc5bf8`: auth completions and native-limit refusals share `/api/auth/$`, including unknown and encoded callback suffixes. Seven new cases reproduced the leak before implementation; all 18 focused logging cases pass after repair. Canonical guidance now names the actual combat imports, Alchemy resource and preview cleanup job. Fresh Standards and Spec reviewers then examined the full original-base-to-`c3bc5bf8` integration and the final viewport change published in `df70b875`. Neither found an actionable issue. Standards independently passed 112 focused tests; Spec passed 79. Their coverage included every implementation slice, with deeper checks at security, infrastructure, migration and deterministic-game boundaries; neither report claims a line-by-line proof of all 621 changed files. The Spec review also covered the complete `df70b875` evidence-document delta.

## CI evidence

[CI](https://github.com/brandhaug/hexwardens/actions/runs/36441143624) and [Audit](https://github.com/brandhaug/hexwardens/actions/runs/36441143648) passed on `4fe2da8f`. The Linux bot case exposed an overly short timing assumption: software rendering reached only turns six to nine within 60 seconds, even at the reduced viewport. The fixture retains `botDelay=1` pacing with a bounded two-minute turn wait and three-minute overall limit. An immediate-pacer browser experiment passed but was slower, so it was not adopted. The ten-turn and browser-error assertions remain unchanged. Check [the PR checks](https://github.com/brandhaug/hexwardens/pull/232/checks) for the final published revision; this evidence document does not substitute for those exact-head results. Earlier CI failures also established and corrected the managed-pnpm bootstrap, screenshot Buffer typing and Gitleaks PR-commit read permission.

## External activation limits

No deployment, remote migration, secret rotation, cloud resource creation/destruction or PR merge was performed. Deployment, preview and backup workflows remain opt-in. Their protected environments, scoped credentials, account/stage mapping, storage retention/monitoring and a real production recovery drill must be established before activation; see [infrastructure operations](infrastructure-upgrades.md).

Read-only requests for repository rulesets and master branch protection returned HTTP 403 with GitHub's requirement to upgrade the private repository's plan or make it public. The committed aggregate CI gate does not establish remote merge enforcement. No billing or visibility setting was changed.

Neither [bevy-ts](bevy-ts-assessment.md) nor [effect-machine](effect-machine-assessment.md) was added to production. Their pinned source and executable type/persistence probes support keeping the current immutable deterministic engine while tightening its existing contracts.
