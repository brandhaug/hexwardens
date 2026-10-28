# Contributing

Start with [local setup](docs/setup.md). Discuss substantial gameplay or architecture changes in an issue before implementation. Use [CONTEXT.md](CONTEXT.md) for domain terms and the nearest `AGENTS.md` for module contracts.

## Changes and validation

Branch from `master` and keep each pull request focused. Add regression coverage for changed behavior, including failure cases. Run `pnpm run check` before committing and `pnpm run validate` before handoff. The latter needs Chromium and permission to start local servers; see [validation prerequisites](docs/setup.md#validation).

Update the existing documentation when behavior changes. Put setup in `docs/setup.md`, deployment in `docs/deploying.md`, and module invariants in the nearest `AGENTS.md`. Keep private research and credentials outside version control.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, with an optional scope. Supported types are `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, and `revert`. Use `!` for a breaking change and explain it in the body.

Examples: `fix(combat): preserve counter damage` and `docs: explain local setup`. `pnpm install` installs the formatting and commit-message hooks. The PR Gate checks titles independently of local hooks. Pull requests are squash-merged using their title as the commit title, so intermediate fixup commits do not become default-branch history.

Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) using observed results. Report skipped or blocked checks explicitly. Fork PRs run credential-free CI; they do not receive deployment secrets. Maintainers can deploy reviewed same-repository branches to an isolated preview account.

## Participation and licensing

Be respectful, keep feedback specific to the work, and avoid harassment or publishing personal information. Report conduct concerns to martin@brandhaug.net.

Contributions are licensed under the repository's [MIT license](LICENSE). Include the source and redistribution license for third-party assets; see [third-party notices](THIRD_PARTY_NOTICES.md). Do not submit assets you cannot redistribute.
