# Infrastructure and bootstrap

`alchemy.run.ts` owns application resources. `alchemy.bootstrap.ts` owns deployment access and GitHub environments. Read [docs/deploying.md](../docs/deploying.md) for operator inputs and recovery.

- App state uses `Cloudflare.state()`. Bootstrap uses private local state and stable `Alchemy.Random` credentials. Preserve the bootstrap state; it holds token values Cloudflare returns only once.
- `bindings.ts` owns resource names, compatibility settings, rate limits and origin validation. `write-wrangler.ts` generates local configs; run `pnpm run infra:wrangler` after changing those contracts.
- `deployment-env.ts` discovers the Workers subdomain. The CLI, CI and smoke checks share its origins. Preview origins always ignore production overrides.
- Production logical IDs, physical names and the `prod` stage are persistence identities. Renaming the Git repository does not authorize replacing D1 or Durable Objects.
- `scripts/alchemy-stage.ts` requires exact account/stage confirmation and refuses production destruction. Production D1 is retained. Keep migration history intact for live installations.
- Bootstrap validates explicit repository/account targets and rejects using the production account for previews. Deployment tokens need Workers Scripts, D1 and Secrets Store Write only. Operator token-management credentials never reach CI.
- Publish workflow enablement only after secrets are written. Cleanup must remain available when preview approval or PR branches disappear.
- Check `pnpm run typecheck`, `pnpm run infra:check`, `pnpm run check:alchemy`, operational tests and script tests. A plan/import test does not establish that live provider permissions work.
