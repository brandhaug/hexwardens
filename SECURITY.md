# Security policy

Report vulnerabilities privately to **martin@brandhaug.net** with `[Hexwardens security]` in the subject. If GitHub private vulnerability reporting is enabled, you can also use [a private advisory](https://github.com/brandhaug/hexwardens/security/advisories/new).

Include the affected commit or deployment, reproduction steps, and observed impact. Remove credentials, session cookies and other players' data. Do not publish exploit details in an issue before a fix is available.

Security fixes target the current `master` branch. Operators of forks are responsible for applying updates and configuring their deployment credentials.

You should receive a response within a week.

## Scope

Reports about authentication, authorization of game actions, fog-of-war filtering, abuse limits and cheating are welcome. Include attempts to act as another player, reveal hidden state or bypass turn order.

## Infrastructure and CI controls

Actions use immutable commit pins and read-only permissions by default. Production requires successful CI and Audit for the exact current default-branch commit. Bootstrap declares branch protection and the production environment; operators must apply it successfully before relying on those protections. Required checks do not replace review of workflow and infrastructure changes.

Audit scans committed history with Gitleaks and the pnpm lockfile with Trivy, including development dependencies. High and critical findings fail. Trivy reads exceptions only from the trusted default-branch base, so a PR cannot exempt itself. Exceptions require a narrow vulnerability identifier, justification, owner and expiry. Scanner and advisory database failures must fail closed.

Previews require a separate Cloudflare account and preview-only credentials. Same-repository PR code receives those credentials; configure environment reviewers when approval is required. Forks and Dependabot receive none. Cleanup uses trusted default-branch code and numeric PR stages. Never place production credentials at repository scope.

Native Cloudflare rate limits supplement authentication and gameplay throttles. They are per-location limits, not global counters.

## Backup data handling

D1 exports contain authentication records and player data. Backups are encrypted before upload and authenticated before restore. Restore drills use disposable local D1 and remove plaintext temporary files. Keep storage private, restrict the backup principal, configure retention and escrow the encryption key outside GitHub. D1 backups do not contain active Durable Object match state. See [deployment and recovery](DEPLOYMENT.md).
