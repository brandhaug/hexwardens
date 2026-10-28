# CI and repository automation

Read [docs/deploying.md](../docs/deploying.md) before changing secrets, environments or deployment triggers.

- Fork PRs run credential-free CI. Keep default token permissions read-only and checkout credentials disabled. Pin third-party Actions by commit SHA.
- `CI gate` fails when any required job fails, is cancelled, or is skipped. `audit` scans secrets and dependencies with policy from the trusted base. Preserve these check names; GitHub branch protection requires them.
- `Conventional commit title` is the semantic PR check. Squash merges use the PR title. Keep its allowed types aligned with `scripts/check-commit-message.ts`.
- Deployment requires successful CI and Audit push runs for the exact current `master` SHA. Never consume untrusted workflow artifacts or run fork code with production secrets.
- `DEPLOY_ENABLED`, `PREVIEW_ENABLED`, `BACKUP_ENABLED`, and `CATALOG_UPDATES_ENABLED` are repository variables. Jobs cannot read environment variables until their environment is selected.
- Preview code receives only separate-account preview credentials. Close cleanup checks out the default branch and uses `preview-cleanup`; it must remain serial with preview deployment.
- Check workflow changes with actionlint when available and run `pnpm run test:scripts`. Keep action/tool pins consistent with the local setup action.

GitHub billing and plan restrictions are external failures. Report them rather than weakening checks or changing repository visibility. GitHub secret values are write-only; migrate through the operator bootstrap, never by printing or extracting them into committed files.
