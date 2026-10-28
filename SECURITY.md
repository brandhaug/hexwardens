# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately via [GitHub Security Advisories](https://github.com/brandhaug/hexwardens/security/advisories/new) — do not open a public issue.

Include reproduction steps and the affected component (web app, game server, or game logic). You should receive a response within a week.

## Scope

The multiplayer game server (`apps/game-server`) is the most security-sensitive surface: authentication, authorization of game actions, fog-of-war state filtering, and abuse/rate limiting. Reports about cheating vectors (acting as another player, seeing through fog of war, bypassing turn order) are very welcome.

## Infrastructure and CI controls

GitHub Actions use immutable commit pins and read-only permissions by default. The Vite+ bootstrap is pinned to a release commit, verified by SHA-256, and installs a frozen pnpm lockfile. Production requires green CI and Audit on the exact current default-branch commit, a protected environment and an exact account/stage confirmation. The destroy wrapper refuses production, and Alchemy retains production D1 if its declaration is removed.

Require `CI gate` and `audit` in branch rules, with review of changes to `.github/`, `infra/`, `alchemy.run.ts`, operations scripts and dependency policy. GitHub branch rules and environment protections are account settings; code does not configure them. Add CODEOWNERS for those paths with the team's real reviewers before enabling automatic deployment. A PR can edit its own workflow, so required checks alone are not a substitute for protected review of workflow changes.

Audit scans committed history with Gitleaks' built-in rules and checks the pnpm lockfile with Trivy, including development dependencies. High and critical findings fail the job. Trivy runs with an empty config against a temporary directory containing only the lockfile, and reads `.trivyignore.yaml` only from the trusted default-branch base. A proposed PR exception cannot exempt itself. An exception needs a narrow vulnerability identifier, justification, owner and expiry reviewed on the default branch; do not add broad path or package exclusions. Scanner or advisory database failures must fail closed.

Preview deployments require a separate Cloudflare account and preview-only secrets. Same-repository PR code can use those credentials after protected environment approval; forks and Dependabot receive none. Cleanup runs trusted default-branch code and can target only a numeric PR stage. Never place production credentials at repository scope, where a preview job could acquire them.

`WEB_RATE_LIMITER` and `GAME_RATE_LIMITER` are native Cloudflare per-location rate-limit bindings. Their coarse limits are 60 and 120 requests per minute respectively, with separate namespace IDs per stage. They supplement application-specific authentication and gameplay throttles; they are not global counters.

## Backup data handling

D1 exports contain authentication records and player data. The backup command encrypts before storage upload and authenticates ciphertext and completion records before restore. The restore drill writes only to a disposable local D1 database and removes plaintext temporary files. Keep bucket access private, limit the backup principal to the backup prefix, configure retention, and escrow the encryption key outside GitHub. Backups do not contain active Durable Object match state. See [deployment and recovery](DEPLOYMENT.md) for required account settings and recovery checks.
