# Agent notes for amigo

Short working loop. Human setup lives in [README Quick Start](./README.md#quick-start); playbooks in [CONTRIBUTING.md](./CONTRIBUTING.md). Cursor rules under `.cursor/rules/` apply when matching files are open.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `pnpm run dev` |
| Check secrets (names only) | `pnpm run dev:verify` |
| Local D1 migrate + seed | `pnpm run dev:setup` |
| Wipe local D1 and re-seed | `pnpm run dev:reset` |
| One-time UI sign-in URL | `pnpm run agent:signin-url` |
| Lint | `pnpm run lint` |
| Route types | `pnpm run typegen` (also part of `typecheck`) |
| Types | `pnpm run typecheck` |
| Fast tests | `pnpm run test:unit` |
| Workers / D1 / DO tests | `pnpm run test:integration` |
| Schema migration | `pnpm run db:generate` then `pnpm run db:migrate:local` |

Prefer `pnpm run test:unit` (and `test:integration` when touching Workers/D1/DO) over driving the browser to verify behavior.

## Invariants

- Money in D1 and API payloads is **integer cents**, never floats.
- Every D1 query must filter with `scopeToHousehold()` from `@amigo/db`.
- Do not create, mount, or commit `.dev.vars`. Do not commit live Cloudflare IDs.

## Layout

- Pages: `apps/web/app/routes/*.tsx`
- JSON APIs: `apps/web/app/routes/api.*.ts` → handlers in `apps/web/server/api/`
- Schema / seed: `packages/db/`
- Worker-only (`/ws`, cron): `apps/web/worker.ts`

## Auth

- Unit and integration tests mock `getAuth` / session. Do not drive the Clerk UI for tests.
- For a signed-in browser session: `pnpm run dev` (and `dev:setup` once), then `pnpm run agent:signin-url` and open the printed URL immediately. stdout is the URL only — do not paste it into logs, PRs, or chat.
- In `APP_ENV=development`, first login whose email matches `AGENT_LOGIN_EMAIL` claims seed user `user-seed-001` / household `hh-seed-001`. Otherwise first login goes to `/setup` and creates an empty household.
- Filling the Clerk form with `AGENT_LOGIN_PASSWORD` is a last resort. Never print that password.

## Gotchas

- Invite **codes** work locally; outbound invite email does not without operator Email Routing — share the code.
- `/calendar` redirects to `/dashboard`.
- Seed groceries/budgets are invisible unless the claim above succeeds (`pnpm run dev:setup` first). After a local D1 wipe, run `pnpm run dev:reset` so claim can run again.
