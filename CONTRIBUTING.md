# Contributing to amigo

Thank you for your interest in contributing. This document covers how to propose changes and what we expect before a pull request is merged.

## License

amigo is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). By contributing, you agree that your contributions are licensed under the same terms and that you have the right to submit them.

If you run a modified version as a network service, AGPL obligations may apply to users of that service. See the license preamble and section 13 for details; this is not legal advice.

## Before you start

- Read [README.md](./README.md) for stack overview and local setup.
- Agents: [AGENTS.md](./AGENTS.md) for commands, invariants, and local login.
- For how the app is structured, see [How it works](./README.md#how-it-works) in the README.
- Search [existing issues](https://github.com/j-cadena-g/amigo/issues) to avoid duplicate work. For larger changes, open an issue first to discuss approach.

## Development setup

Follow [README Quick Start](./README.md#quick-start). You do **not** need a Cloudflare account, Workers Builds, Cursor Cloud Agent secrets, or a production Environment to contribute. Local Vite uses simulated D1/KV.

If `pnpm run dev:verify` fails, set the **required** keys (Clerk + `APP_ENV` + `APP_ORIGIN`). Optional Cloudflare / VAPID keys only produce a note. Missing `AGENT_LOGIN_EMAIL` means first login will not claim the seeded Demo Household. Missing `AGENT_LOGIN_PASSWORD` is fine; prefer `pnpm run agent:signin-url` for agent UI login.

Invite **codes** and `/join/:code` work locally. Outbound invite email uses operator Email Routing and will not send without that domain — share the code manually instead.

For **Cursor Cloud Agents** (operators/maintainers only), see [README § Cursor Cloud Agents](./README.md#cursor-cloud-agents-operators--maintainers) and [AGENTS.md](./AGENTS.md). Do not copy app secrets into Cursor.

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

### Playbooks

#### Add an API resource

1. Handler in `apps/web/server/api/<name>.ts`: Zod body/query, `handleApiRoute` auth mode (`strict` unless public), `enforceRateLimit` with a `ROUTE_RATE_LIMITS` preset (`READ` / `MUTATION` / `BULK` / `SENSITIVE`).
2. Scope every D1 query with `scopeToHousehold(…, session.householdId)`. Money fields are integer cents.
3. Permissions: `canManageHousehold` / `canManageMembers` / `canTransferOwnership` from `apps/web/server/lib/permissions.ts` when the action is not member-safe.
4. Thin route module `apps/web/app/routes/api.<name>.ts` that calls `handleApiRoute` (see `api.tags.ts`).
5. Test with mocked `getAuth` / session (unit or `*.integration.test.ts`). Do not drive the Clerk UI.

#### Add a page

1. Route module under `apps/web/app/routes/` (loader/action + UI). Use `requireSession(context)` for authenticated pages.
2. Load data in the loader with `scopeToHousehold()`. Keep mutations in `/api/*` handlers when the client already uses fetch + Clerk `getToken()`.
3. Run `pnpm run typegen` so `./+types/…` stays in sync (included in `pnpm run typecheck`).

#### Database schema changes

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

Please avoid drive-by refactors, dependency major bumps without discussion, and changes that commit live deployment-specific IDs or domains. Keep real Cloudflare binding identifiers in **your** 1Password Environment (see `apps/web/.deploy.env.example` and `apps/web/.op/refs.env.example`) or another deploy-time secret store, not in tracked config.

## Security

Do not report security vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).

## Questions

Use GitHub issues for bugs and feature discussion. For security-sensitive topics, use the process in [SECURITY.md](./SECURITY.md).
