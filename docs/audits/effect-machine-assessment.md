# Effect Machine assessment

Investigated 2026-09-28 against upstream commit `69c02368cc77be84916cae987563d57780837379` and published `@typeonce/effect-machine@0.39.0`.

## Recommendation

Keep Effect Machine as an isolated lifecycle prototype until upstream publishes
support for the repo's Effect `4.0.0-rc.118`. Latest `@typeonce/effect-machine@0.39.0`
requires `4.0.0-rc.117` exactly. The core planner compiles and runs on rc.118 in our
diagnostic fixture, but the published peer contract still rejects that pair.
The optional reactivity adapter also fails on rc.118; this scoped use does not
need that adapter.

The focused follow-up below provides executable tests and a reproducible
compatibility matrix. Do not downgrade Effect, bypass peer validation, add a
second runtime, or treat this prototype as a production integration.

## Fit

The library separates a schema-defined topology from its handler implementation. Its pure planner can compute transitions without starting a live runtime. The live runtime owns scoped effects and invocations. These distinctions fit Hexwardens' existing separation between `match/step.ts`, typed `MatchEffect` values and host adapters. See the [machine source](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/src/Machine.ts) and [implementation guide](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/docs/agent-guide.md).

A useful experiment would model a connection as Connected, Disconnected with an absolute deadline, and Forfeited. An Expire event carries the observed clock time. This makes state-owned deadlines explicit, retains the injected clock and allows the host to keep using Cloudflare alarms.

Keep gameplay behind `dispatch`, the bot epoch checks, per-tribe fog projection, wire codecs and idempotent persistence. Statechart types do not prove any of these game invariants. The existing exhaustive MatchCommand/MatchEffect unions already protect much of the command protocol; the added benefit would be rejecting invalid transition targets and missing state-specific data.

## Persistence and lifecycle constraints

Machine snapshots have a versioned codec. Resumption restores logical state, completion and history, then starts state-owned invocations again. Timers restart for their full duration; prior fibers, subscriptions, queues and child runtimes are not restored. This conflicts with using a live relative timer for a disconnect grace period that must survive Durable Object hibernation. Keep absolute deadlines in persisted state and deliver alarm events through the host. See [persistence documentation](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/README.md#persistence).

Hexwardens currently commits offline actions synchronously and uses state identity to decide whether to persist. Replacing that path with an asynchronous mailbox would require a deliberate contract change. The synchronous planner is the candidate for preserving the current behavior. A successful `send` must also not be mistaken for an application-level acknowledgement; the upstream guide distinguishes event submission from observing its result.

The package's reactivity adapter still imports `effect/unstable/reactivity`, while the selected Effect RC removes that import path. A core planner smoke test alone would therefore not establish React adapter compatibility. The [adapter source](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/src/internal/machine/atom.ts) is part of any future compatibility review.

## Comparison

| Choice                                           | Benefit                                                  | Cost for Hexwardens                                                                                    | Current decision                                      |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Existing reducer and strict compiler/lint checks | Strengthens current contracts with limited migration     | Fix existing unchecked access and optional-value errors                                                | Implement in this upgrade                             |
| Effect Machine planner                           | Typed destinations, state-owned data, model exploration  | Translate lifecycle states, preserve host effects and persistence format; exact Effect peer constraint | Best next candidate for a focused lifecycle prototype |
| bevy-ts runtime                                  | Closed ECS schema and declared component/resource access | Replace immutable game state and add transaction/projection adapters                                   | Do not adopt for this upgrade                         |

## Observed validation

Failure cases were written before the isolated probe. TypeScript 7.0.2, with strict indexed access and optional-property checks, accepted the program and consumed all three expected-error directives. The rejected cases are an invalid event payload, an undeclared target and missing required destination data.

Node 24.21.0 ran the planner probe with exit code 0 and no output. Expiry at 99 retained Disconnected for deadline 100; expiry at 100 reached Forfeited. Encoding and decoding the disconnected snapshot preserved replay behavior. Invalid snapshot input failed decoding.

This verifies the published package with Effect rc.117 only. It does not prove Cloudflare hibernation, live mailbox ordering, runtime cancellation, React adapter compatibility or full-game equivalence.

## Focused follow-up

Rechecked on 2026-09-28. `git ls-remote` still reports upstream HEAD
`69c02368cc77be84916cae987563d57780837379`; npm still reports latest `0.39.0`.
The exact rc.117 peer requirement remains. A strict npm install with rc.118 fails
with `ERESOLVE`. No supported current release was found.

The [executable prototype](effect-machine/planner.ts) and its
[tests](effect-machine/planner.test.ts) replace the inline smoke program. The
[failure inventory](effect-machine/failure-cases.md) was written before the new
implementation. This is an isolated experiment, not a production integration.
No workspace dependencies, game saves, engine paths, or host contracts change.

### Compatibility results

| Check                                                            | Effect rc.117, declared pair | Effect rc.118, diagnostic only                                       |
| ---------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Strict peer installation                                         | Pass                         | `ERESOLVE`                                                           |
| Public core entry point, TypeScript 7.0.2, `skipLibCheck: false` | Pass                         | Pass                                                                 |
| Five synchronous planner tests                                   | 5 passed                     | 5 passed                                                             |
| Optional `/reactivity` import                                    | Pass                         | `ERR_MODULE_NOT_FOUND`, missing `effect/dist/unstable/reactivity.js` |

The rc.118 diagnostic unpacks the unmodified published tarball into a separate
temporary fixture with one Effect runtime. It does not override peers or add a
second runtime to Hexwardens. Core planning does not import the broken adapter.
The adapter failure is therefore **not** a core runtime incompatibility. The
remaining core adoption blocker is upstream's unsupported exact peer range.
Upstream needs to publish a release supporting rc.118; this task does not justify
a repo-wide downgrade, private fork, or peer override.

The package source and exports are independently inspectable in the
[pinned manifest](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/package.json),
[core module](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/src/Machine.ts),
and [optional adapter](https://github.com/typeonce-dev/effect-machine/blob/69c02368cc77be84916cae987563d57780837379/packages/effect-machine/src/internal/machine/atom.ts).

### What the prototype adds

Five runtime tests cover absolute deadline retention, repeated disconnect,
early/exact/late expiry, reconnect followed by stale expiry, a second disconnect,
terminal forfeiture, JSON save/restore replay, and malformed snapshot refusal.
Five `@ts-expect-error` checks reject malformed observed time, missing or malformed
deadline, undeclared target, and missing destination-owned data. Strict compilation
must consume every directive.

The new identity checks caught a behavior missing from the original assessment:
`Machine.plan` reconstructs the snapshot even for an ignored event. Returning
`plan.next` directly would violate the engine's identity-based persistence rule.
The prototype retains the input reference unless a planned microstep reports
`changed`. This is safe for this three-state planner, which has no actions,
invocations, eventless transitions, or machine commands. It is not a generic
adapter for arbitrary machines.

### Fit against the actual host

`DisconnectInfo` currently requires `tribe`, `username`, and `deadline` in
`MatchState.disconnectedPlayers`; `forfeitedTribes` and the game's elimination
state already record terminal facts. Missing deadline data is therefore already
rejected for persisted disconnect records. A state-owned schema adds typed
transition destinations and event payloads, but storing machine snapshots beside
those records would introduce a second source of truth. A future integration
should derive the planner input from existing facts and write back through the
existing reducer, with no save-format migration.

`pump.ts::pickDueCommand` currently removes an expired disconnect through a
`playerReconnected` command, then sends `forfeit`. A focused integration could
replace that semantically misleading pair with one expiry command containing the
observed time, and check the stored deadline in `step`. The host must retain
forfeit-before-turn-timeout ordering and re-evaluate game-over after each command.
A planner alone does not enforce either rule.

`Match` loads `ctx.storage.kv` in its constructor and supplies `Date.now` plus
`setAlarm` through the existing ports. Wake must keep the persisted absolute
deadline; neither `planInitial` nor a fresh relative timer belongs on that restore
path. Reconnect currently removes the pending disconnect before
`connectionOpened`; `runMatchCommand` interprets effects, emits lifecycle events,
then persists only changed state. Preserve that ownership and order.

The experiment is a pure module, not an Effect service: it owns no clock,
persistence, scheduler, or live process. Existing `MatchHost`, `MatchClock`, and
`MatchScheduler` retain those responsibilities. No React/reactivity adapter is
needed. Immediate offline dispatch, gameplay `dispatch`, bot RNG/epochs, fog and
wire codecs stay outside this experiment.

The prototype demonstrates useful transition typing and identifies an identity
adapter requirement. It does **not** yet demonstrate a net reduction in production
transition logic. Real Durable Object wake/alarm coverage, full save compatibility,
match-over/deadline ordering, and host effect parity remain adoption acceptance
work once a supported release exists. The concurrent readonly-engine work should
only require readonly input compatibility at this small seam, not engine changes.

## Reproduction

Requires Node 24, npm, Bash, tar, and registry access. From the repo root:

```sh
bash docs/audits/effect-machine/run.sh
```

The runner installs pinned packages with lifecycle scripts disabled in fresh
temporary directories, checks the supported pair, verifies strict peer rejection,
and separately diagnoses core and adapter behavior on rc.118. It retains package
locks, tarball integrity metadata, current npm release metadata, compiler logs,
TAP test output, and expected failure logs in the printed evidence directory.
Exit 0 means the documented matrix was reproduced, including the expected
failures. `.fallowrc.json` excludes only this isolated fixture from workspace
dependency analysis; its dependencies are installed by the runner. This is an explicit audit command, separate from workspace typechecks.

Observed with Node 24.21.0 and TypeScript 7.0.2: both strict compilations passed,
both runs passed all five runtime tests, the unsupported installation failed, and
only the rc.118 optional adapter import failed. No Worker hibernation or full-game
compatibility is claimed by these results.
