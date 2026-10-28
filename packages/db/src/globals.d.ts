// Minimal ambient declaration for `process.env.NODE_ENV`, which
// @hexwardens/game-logic reads for test-only invariants (src/dispatch.ts).
// This package type-checks game-logic sources directly (workspace source
// imports); @cloudflare/workers-types supplies the other host globals but
// not `process`.
declare const process: { env: { NODE_ENV?: string } }
