# Planner experiment failure cases

Write these checks before the new planner implementation. This isolated experiment must not import into the production engine.

- Missing or nonnumeric deadlines, malformed observed times, undeclared destinations, and missing state-owned data must fail compilation.
- Disconnect must retain the supplied absolute deadline. Repeated disconnect must not extend it.
- An alarm before the deadline must leave the snapshot unchanged. At or after the deadline, exactly one transition may enter Forfeited.
- Reconnect must remove the pending deadline. A stale alarm after reconnect must do nothing. A later disconnect must use its newly supplied deadline.
- A forfeited connection must stay forfeited across reconnect, disconnect, and repeated expiry.
- Encoding, JSON round-trip, decoding, and constructing a fresh planner snapshot must retain the deadline and equivalent expiry behavior. Malformed persisted snapshots must fail decoding.
- A planner call must return synchronously, without timers, live processes, React adapters, or mailbox acknowledgements.
- The public core entry point must compile and run with one Effect runtime. Test the declared rc.117 pair and diagnose rc.118 separately. A strict peer install rejection is an adoption blocker even if core execution succeeds.
- Optional reactivity imports must be tested separately so their failure does not imply the core planner fails.

Production acceptance remains separate: real Durable Object reconstruction and alarms, existing save format and identity, deadline priority, game-over short-circuiting, host effect ordering, fog projection, bot epochs, and immediate offline dispatch. An isolated snapshot replay cannot prove those contracts.
