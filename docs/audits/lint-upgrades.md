# Lint upgrade ledger

Reference: `b2b-saas-starter` at `1c273c36b72f7fd9d4f867aece3d1787dcffae68`, root `lint.config.ts` and `packages/oxlint-plugin`.

The baseline Hexwardens config enables correctness diagnostics and six named rules. Its documented prohibitions on assertions, console calls and platform imports in game logic are largely unenforced.

The port enables the starter's applicable core, TypeScript, Unicorn, import, promise, Vitest, React, hooks, accessibility, Effect, anti-slop, React Doctor and Vite+ rule groups. A local plugin carries checks for Effect internals, schema compilation, declaration-merge placement/context, unknown error-message probing, Effect predicates and Effect test runners. Existing upstream rule tests are included.

Hexwardens-specific configuration enforces the game package's platform-free imports and rejects console calls in application code. Tooling, framework routes, ambient declarations and React Three Fiber receive documented exceptions for their actual host contracts.

The starter's `no-dark-prefix` and `no-hex-color` rules were not ported. They enforce that project's single-theme design and would contradict Hexwardens' own design tokens and renderer colors. Its SaaS workspace import paths and absent-library capability list were adapted. The WebGL rule applies here; localization and React Compiler rules require those capabilities before they can be enabled.

The engine migration enables checked indexed access and exact optional properties without assertions or default-filled test fixtures. `PlayerStateRecord` now represents participating tribes as a partial record; validated schema fields omit absent values. Shared action results and structured match logs have named contracts. Finite domain schemas reject non-finite values before encoding. Existing deterministic and fog-boundary tests remain; five additional wire checks were written before the finite-schema change (three failed against the old encoder).

Observed engine checks: 766 tests in 70 files, TypeScript and native Effect diagnostics with zero findings. The custom plugin runs 55 real-linter cases in seven files. Integrated application tests pass: 333 web, 200 game-server, 766 game-logic, 55 plugin, six infrastructure checks, and 11 scanner regression cases with the real scanner binaries. Full compiler and native Effect diagnostics pass. Browser validation and independent review are tracked in the integration report.

Exceptions preserve real contracts: game snapshots require fresh object copies; bot pacing and match commands are sequential; Durable Object, React and Node adapters use native host APIs; generated Workers declarations are not hand-maintained application code. Existing design tokens and custom renderer accessibility receive file/site-specific explanations, not broad disablement of type or security rules. Native unknown-input contracts remain confined to decoders and external adapters. Two unsafe autofix rules are disabled: constructor insertion corrupts Effect tagged-error factories, and catch-variable renaming can shadow an outer result accumulator.

The staged formatter hook preserves partial staging. Full lint, compiler diagnostics and dead-code regression checks are explicit local and CI gates. Root Vite/lint/tool scripts are also covered by `tsconfig.repo.json`.
