# Deep Security Scan Remediation Plan

**Branch:** `security/deep-scan-remediation`

## Summary

Fix the 19 findings from the deep security scan in grouped workstreams on a branch separate from `main`. Keep the scan artifacts unchanged, preserve unrelated local changes, and validate with focused regression tests plus the repository's standard checks.

## Branch Safety

- Start from `main`.
- Create and switch to `security/deep-scan-remediation` before edits.
- Verify with `/usr/bin/git branch --show-current`.
- Abort implementation if still on `main`.
- Do not stage unrelated local changes.

## Key Changes

- Add `APP_ORIGIN` as a required Worker var in `Env`, `wrangler.jsonc`, `.dev.vars.example`, `.deploy.env.example`, and `scripts/render-wrangler-deploy-config.mjs`; real values live only in 1Password Environments.
- Add API unsafe-method Origin/Referer checks for authenticated `POST`, `PATCH`, `PUT`, and `DELETE` routes.
- Add WebSocket Origin validation and pass `authorizedParties: [env.APP_ORIGIN]` to Clerk WebSocket authentication.
- Revalidate strict-auth sessions before unsafe mutations with `assertSessionStillValid()`.
- Require Clerk `org:admin` for initial setup; remove Clerk organization membership when app members are removed.
- Add `users.restoreAllowedUntil`; admin removals leave it null, so removed users cannot self-restore.
- Prevent admin peer-admin demotion unless requester is owner.
- Add shared authorization helpers for grocery tags, financial account refs, audit record visibility, and transaction write/delete permissions.
- Allow admin takeover of another member's personal financial object only with explicit `adminTakeover: true`, `isShared: true`, audit logging, and a security event.
- Add asset audit support before exposing asset audit history.
- Validate push endpoints against unsafe SSRF destinations.
- Neutralize formula-leading CSV export cells.
- Bound recurring rule start dates and cap calendar expansion work.

## Public API / Interface Changes

- New env binding: `APP_ORIGIN`, exact origin only, no path.
- Financial object PATCH payloads gain optional `adminTakeover: boolean`.
- Restore endpoints only operate for soft-deleted users with future `restoreAllowedUntil`.
- Audit history safely supports `table=assets` after asset audit and visibility checks are added.

## Test Plan

- Add focused failing tests before fixes where practical.
- Cover route Origin checks, WebSocket Origin checks, setup org-admin checks, Clerk removal cleanup, restore denial for admin removals, peer-admin demotion denial, sync tag tenant checks, account ref visibility, audit visibility, transaction write/delete permissions, admin takeover audit behavior, push endpoint validation, CSV formula neutralization, and recurrence bounds.
- Run:
  - `bun run typecheck`
  - `bun run test:unit`
  - relevant `bun run test:integration`
  - final `bun run test:integration` if touched integration surfaces are broad enough to justify it

## Assumptions

- Admin takeover remains supported only as an explicit audited operation.
- `APP_ORIGIN` is sourced from 1Password Environments and rendered through the existing config flow.
- Owner-issued restore eligibility UI is outside this remediation; the backend field is added so future restore invitations can be explicit.
