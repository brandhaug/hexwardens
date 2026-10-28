# Deployment

Hexwardens uses Alchemy `2.0.0-beta.84`, with matching `@alchemy.run/cloudflare`, `@alchemy.run/github` and frontend-framework packages. `alchemy.bootstrap.ts` manages operator access and GitHub configuration; `alchemy.run.ts` manages the application. Keep their state separate.

See the [runtime and recovery runbook](../DEPLOYMENT.md) for migration bookkeeping, paired-Worker compatibility, preview cleanup and backup restore procedures.

## Bootstrap prerequisites

Use a persistent operator checkout. Install dependencies and authenticate `gh` to the repository you intend to deploy. GitHub must support environments and branch protection for that repository: public repositories support these features; private repositories may require a paid plan. Hosted Actions also needs available runner minutes and a working billing account.

Create a Cloudflare operator API token with **Account API Tokens: Edit** for the deployment account. Cloudflare documents [account-owned token creation](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/create/). Keep this operator credential out of CI. Bootstrap creates a separate deployment token limited to these account-level permissions:

| Permission            | Use                                                     |
| --------------------- | ------------------------------------------------------- |
| Workers Scripts: Edit | Workers, assets, Durable Object bindings and namespaces |
| D1: Edit              | Database provisioning and migrations                    |
| Secrets Store: Edit   | Alchemy's Cloudflare state backend                      |

The grants cover the selected account, not just resources with the `hexwardens-` prefix. Use a dedicated account when other applications require isolation.

## Apply bootstrap

Privately export the operator token as `CLOUDFLARE_API_TOKEN`; do not place its value in a command argument, issue, or committed file. Set the account and repository explicitly:

```sh
export CLOUDFLARE_ACCOUNT_ID='<32-character-account-id>'
export BOOTSTRAP_GITHUB_REPOSITORY='<owner>/<repository>'
export GITHUB_TOKEN="$(gh auth token)"
pnpm run bootstrap:plan
pnpm run bootstrap:deploy
unset CLOUDFLARE_API_TOKEN GITHUB_TOKEN
```

The GitHub credential needs repository administration, environments, secrets and variables write access. Review public deployment choices in `deployment.config.ts`. Empty reviewer lists permit automatic deployment after CI. Adding reviewers requires a GitHub plan that supports those environment protections.

Configure [branch protection](#branch-protection) separately in GitHub before enabling releases. Bootstrap manages deployment access and environments only.

Bootstrap creates the `production` environment, restricted to `master`, and publishes these environment secrets:

| Secret                  | Source                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Account-owned deployment token created by bootstrap         |
| `CLOUDFLARE_ACCOUNT_ID` | Explicit operator input                                     |
| `BETTER_AUTH_SECRET`    | Stable Alchemy Random value                                 |
| `AUTH_JWT_SECRET`       | Separate stable Alchemy Random value shared by both Workers |

It sets repository variable `DEPLOY_ENABLED=true` after the secret resources are published. GitHub job conditions cannot use environment-scoped variables before selecting an environment.

The scripts use `umask 077`. Local `.alchemy/` bootstrap state contains credential values, including tokens Cloudflare returns only once. Keep a private recoverable backup. Reapply from the same checkout; deleting state and re-running generates new credentials and auth secrets. A new auth secret invalidates existing sessions and game tokens. Bootstrap does not import credentials from the old repository or local-development `.env`.

If an apply fails after token creation, retain the state and rerun. Do not destroy the bootstrap stack to roll back: that revokes its managed credentials. Before adopting bootstrap for an existing live installation, plan the auth-secret transition and confirm the application state identity.

## Branch protection

Branch protection and merge settings are owned directly in GitHub, outside Alchemy state. `CI gate` requires lint, typechecking, unit tests, builds and all E2E shards. Require it alongside Audit and the Conventional Commit PR-title check, all bound to the GitHub Actions app:

```sh
repo=brandhaug/hexwardens
gh api --method PUT "repos/$repo/branches/master/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "CI gate", "app_id": 15368 },
      { "context": "audit", "app_id": 15368 },
      { "context": "Conventional commit title", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
gh repo edit "$repo" --enable-squash-merge --disable-merge-commit --disable-rebase-merge --delete-branch-on-merge
gh api --method PATCH "repos/$repo" \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
```

For a checkout that previously declared `default-branch` in bootstrap, preserve a private backup of `.alchemy/` and detach that one state record before applying the updated stack:

```sh
pnpm exec alchemy state delete hexwardens-deployment-access/prod/default-branch --backend local --no-input
```

This deletes only Alchemy's record, not the GitHub rule. Do not delete the rest of bootstrap state. Verify live protection with `gh api repos/brandhaug/hexwardens/branches/master/protection`.

## Production

Pushes to `master` run CI and Audit. Deploy runs only after both pass for the exact current default-branch SHA. Production mutations are serialized. Manual dispatch of `deploy.yml` uses the same checks; `ci.yml` also supports manual dispatch for diagnostics, but production qualification uses successful push runs.

Deployment discovers the account's `workers.dev` subdomain and uses:

- `https://hexwardens-web.<subdomain>.workers.dev`
- `https://hexwardens-game-server.<subdomain>.workers.dev`

The auth origin, game-server origin, client bundle and smoke checks use the same resolver. To use custom domains already attached to the Workers, set production environment variables `BETTER_AUTH_URL` and `GAME_SERVER_URL` to their exact HTTPS origins. These overrides do not provision DNS or custom domains. Optional `BETTER_AUTH_TRUSTED_ORIGINS` and `ALLOWED_ORIGIN` are comma-separated exact HTTPS origins and default to the web origin.

For an operator deployment, export the deployment token, account ID, and auth secrets, then run:

```sh
pnpm run deploy --confirm-target="$CLOUDFLARE_ACCOUNT_ID/prod"
```

Production names and the `prod` stage are stable. A fresh Git repository does not reset Cloudflare resources. Confirm the existing Alchemy stack/stage before adopting resources; do not use `--adopt` to hide unexplained collisions. Production D1 has a retain policy and the wrapper refuses production destruction.

## Preview environments

Set `BOOTSTRAP_PREVIEW_ACCOUNT_ID` to a **different** Cloudflare account before bootstrap. The operator token needs token-management access there too. Bootstrap creates a separate deployment token and separate auth/JWT secrets, publishing `PREVIEW_CLOUDFLARE_API_TOKEN`, `PREVIEW_CLOUDFLARE_ACCOUNT_ID`, `PREVIEW_BETTER_AUTH_SECRET`, and `PREVIEW_AUTH_JWT_SECRET` to both `preview` and `preview-cleanup`. It enables `PREVIEW_ENABLED` after publication. Without an account, previews stay disabled.

Same-repository PRs get isolated `pr-<number>` Workers, D1 and Durable Objects. Fork and Dependabot PRs do not deploy. Closing a PR runs cleanup using default-branch code and preview credentials. Cleanup has no reviewer requirement. Destroy existing previews before removing their bootstrap configuration.

## Optional automation

Catalog Updates stays disabled until `CATALOG_UPDATES_ENABLED=true` and repository secret `CI_PAT` is configured. Use a repository-scoped automation token with Contents and Pull requests write access; a bot token is needed if the resulting PR must trigger CI. Bootstrap deliberately does not copy your interactive `gh` credential into CI.

D1 backup stays disabled until `BACKUP_ENABLED=true`. Configure the `backup` environment with the names in `.github/workflows/backup.yml`: a D1 export token/account, private S3-compatible bucket/endpoint/region, S3 access credentials, and a separately backed-up encryption key. Apply bucket retention externally. The workflow encrypts before upload and verifies a local restore; it does not restore production. Validate a backup and restore drill before relying on this schedule.

## Verification and recovery

The deployment workflow probes game-server `/health` and the web homepage. Also verify sign-in, offline save/reload, and an online match against the deployed origins. A successful local build or bootstrap plan is not a live deployment result.

For a failed deployment, retain the logs, confirm the exact revision and target account, and correct the failing step. Re-deploy a known-good application revision only after checking schema compatibility. D1 migrations are forward changes; reverting source does not undo them. Use D1 Time Travel or a verified backup under a separately reviewed recovery procedure when data restoration is required.
