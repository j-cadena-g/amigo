# Security Policy

## Supported versions

Security fixes are applied to the default branch (`main`) and released through normal deployment. There is no separate long-term support line for older commits.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report suspected security issues privately so they can be triaged and fixed before public disclosure:

1. Open a [private security advisory](https://github.com/j-cadena-g/amigo/security/advisories/new) on this repository (preferred), or
2. Contact the maintainer through a private channel if you already have one.

Include as much detail as you can:

- Description of the issue and potential impact
- Steps to reproduce, or proof-of-concept if available
- Affected routes, APIs, or components (for example auth, household membership, WebSocket hub, D1 access)
- Your environment (local dev vs production) if relevant

You should receive an acknowledgment when the report is received. Timelines depend on severity and complexity; critical issues are prioritized.

## Scope

In scope for this project:

- Authentication and authorization (Clerk integration, household membership, role checks)
- API and WebSocket endpoints exposed by the Worker
- Data isolation between households
- Injection, XSS, CSRF, and similar web application issues in this codebase
- Misconfiguration that could expose secrets, D1 data, or Durable Object state

Generally out of scope:

- Social engineering or phishing against users
- Denial-of-service attacks against third-party services (Cloudflare, Clerk, etc.)
- Issues in dependencies without a demonstrable impact on this application (report upstream when appropriate)
- Vulnerabilities in deployments you do not control (forks with different domains, bindings, or secrets)

## Safe harbor

We appreciate responsible disclosure. Reporters acting in good faith, following this policy, and not exploiting issues beyond what is needed to demonstrate them will not be pursued for that activity.

## Security-related configuration

Operators and contributors should:

- Never commit secrets (API keys, Clerk secrets, agent login passwords, or a local `.dev.vars` file). Prefer [1Password Environments](https://www.1password.dev/environments/) (or an equivalent secret store); the repo lists variable names in `*.example` manifests. Contributors create and use **their own** Environments — do not share or request access to another person’s Environment. Local `op run` injects secrets; deploy uploads with `wrangler deploy --secrets-file`. Do not author secrets with `wrangler secret put` or the Cloudflare dashboard.
- Cursor Cloud Agents should use the same bootstrap as Workers Builds: only `OP_SERVICE_ACCOUNT_TOKEN` and `OP_ENVIRONMENT_ID` in Cursor environment secrets, pointed at **your** local-dev Environment — not copies of individual app keys. Put agent UI login credentials in that Environment as `AGENT_LOGIN_EMAIL` / `AGENT_LOGIN_PASSWORD` (see README), never in the repo.
- Never commit live Cloudflare account IDs, D1 database IDs, KV namespace IDs, or production route/domain bindings. Keep production deploy config in the ignored `apps/web/.wrangler.deploy.jsonc` generated from environment variables.
- Keep Clerk, Cloudflare, and dependency versions reasonably current (Dependabot is enabled for this repo).
- Review household-scoped access in server handlers and route loaders when changing API or WebSocket behavior.

For general development setup, see [CONTRIBUTING.md](./CONTRIBUTING.md) and [README.md](./README.md).
