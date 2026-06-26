# Contributing to amigo

Thank you for your interest in contributing. This document covers how to propose changes and what we expect before a pull request is merged.

## License

amigo is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). By contributing, you agree that your contributions are licensed under the same terms and that you have the right to submit them.

If you run a modified version as a network service, AGPL obligations may apply to users of that service. See the license preamble and section 13 for details; this is not legal advice.

## Before you start

- Read [README.md](./README.md) for stack overview and local setup.
- For how the app is structured, see [How it works](./README.md#how-it-works) in the README.
- Search [existing issues](https://github.com/j-cadena-g/amigo/issues) to avoid duplicate work. For larger changes, open an issue first to discuss approach.

## Development setup

### Prerequisites

- [pnpm](https://pnpm.io) `11.3.0+` (see `packageManager` in `package.json`)
- Node.js on `PATH` (used by helper scripts)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) `4+`
- [1Password CLI](https://developer.1password.com/docs/cli/) and access to the **`amigo (dev)`** Environment (see `apps/web/.op/refs.env.example`)

### First run

```bash
pnpm install
pnpm run dev:setup

cp apps/web/.op/refs.env.example apps/web/.op/refs.env
# Set OP_ENVIRONMENT_ID to the amigo (dev) Environment UUID from 1Password.

pnpm run dev:verify
pnpm run dev
```

`pnpm run dev` wraps Vite in `op run --environment` (via `OP_ENVIRONMENT_ID` in `apps/web/.op/refs.env`; a legacy root `.op/refs.env` still works). Secrets are injected into `process.env` and read by Wrangler through `CLOUDFLARE_INCLUDE_PROCESS_ENV`. Do not mount, create, or commit `.dev.vars`.

If `pnpm run dev:verify` fails, confirm `OP_ENVIRONMENT_ID` is set, the 1Password CLI is installed (`op --version`) and signed in, and every key from `apps/web/.dev.vars.example` has a value in the **`amigo (dev)`** Environment.

For **Cursor Cloud Agents**, do not copy app secrets into Cursor. Set only `OP_SERVICE_ACCOUNT_TOKEN` and `OP_ENVIRONMENT_ID` on the cloud environment — see [README § Cursor Cloud Agents](./README.md#cursor-cloud-agents).

To reset local D1 state: `pnpm run dev:reset`.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Make focused changes with clear commit messages.
3. Run checks locally before opening a pull request:

   ```bash
   pnpm run lint
   pnpm run typecheck
   pnpm run test
   ```

   CI on `main` runs the same commands (see [`.github/workflows/ci.yaml`](./.github/workflows/ci.yaml)).

4. Open a pull request against `main` with:
   - What changed and why
   - How you tested it
   - Screenshots or recordings for UI changes when helpful
   - Notes on database migrations if you changed `packages/db` schema

### Database schema changes

1. Update schema under `packages/db`.
2. Generate migrations: `pnpm run db:generate`
3. Apply locally: `pnpm run db:migrate:local`
4. Include new migration files in your PR and mention them in the description.

Remote migrations are applied at deploy time (`pnpm run deploy`); do not run remote migrations from a PR without maintainer coordination.

### Code style

- Match existing patterns in the touched files (TypeScript, React Router loaders/actions, server handlers under `apps/web/server/`).
- Keep imports at the top of files.
- Prefer small, reviewable diffs over large unrelated refactors.
- Run `pnpm run typegen` when you change routes so generated types stay in sync (included in `typecheck`).

## Pull request expectations

- Target branch: `main`
- All CI checks must pass
- Address review feedback; maintainers squash- or rebase-merge approved PRs
- Do not include unrelated formatting churn, generated `node_modules`, `.wrangler` state, or secrets

### Main branch policy (security hardening)

`main` is protected by a repository ruleset for supply-chain and integrity hardening:

- Pull requests are required; at least one approving review is required, stale reviews are dismissed when new commits are pushed, and the latest push must be approved
- Review threads must be resolved before merge
- Required status checks must pass and stay up to date (`lint-and-typecheck`, `test`, `CodeQL`)
- **Merge commits are disabled**; only squash or rebase merges are allowed, with linear history enforced
- **Commits must be signed** ([configure commit signing](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) with GPG or SSH before opening a PR)
- Merged pull request branches are deleted automatically

See [`.github/workflows/ci.yaml`](./.github/workflows/ci.yaml) for what CI runs locally and in GitHub Actions.

## What to contribute

Good candidates:

- Bug fixes with a clear reproduction
- Tests for existing behavior (Vitest)
- Documentation improvements in README or CHANGELOG
- Accessibility and UX improvements with brief testing notes

Please avoid drive-by refactors, dependency major bumps without discussion, and changes that commit live deployment-specific IDs or domains. Keep real Cloudflare binding identifiers in a 1Password Environment (see `apps/web/.deploy.env.example` and `apps/web/.op/refs.env.example`) or another deploy-time secret store, not in tracked config.

## Security

Do not report security vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).

## Questions

Use GitHub issues for bugs and feature discussion. For security-sensitive topics, use the process in [SECURITY.md](./SECURITY.md).
