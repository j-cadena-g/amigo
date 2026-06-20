#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClerkClient } from "@clerk/backend";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const deployConfigPath = path.join(rootDir, ".wrangler.deploy.jsonc");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const remote = args.has("--remote");

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

const membershipsJsonPath = getArgValue("--memberships-json");

function usage() {
  console.error(`usage: node scripts/backfill-clerk-household-metadata.mjs [--remote] [--apply] [--memberships-json path]

Reads active household memberships from D1 and syncs Clerk publicMetadata
(householdId, householdName) for each user.

Defaults to dry-run. Pass --apply to write Clerk metadata updates.
Use --remote for production D1 via wrangler (requires CLOUDFLARE_API_TOKEN or wrangler login).
Use --memberships-json to skip D1 reads when you already exported memberships.

Run with production secrets before db:migrate:remote:
  bun run wrangler:deploy-config
  bash scripts/run-with-1password-environment.sh -- \\
    node scripts/backfill-clerk-household-metadata.mjs --remote --apply
`);
}

if (args.has("--help") || args.has("-h")) {
  usage();
  process.exit(0);
}

function requireSecretKey() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("error: CLERK_SECRET_KEY is required.");
    process.exit(1);
  }
  return secretKey;
}

function queryD1(sql) {
  const wranglerArgs = [
    "wrangler",
    "d1",
    "execute",
    "amigo-db",
    "--json",
    "--command",
    sql,
  ];

  if (remote) {
    wranglerArgs.push("--remote", "--config", deployConfigPath);
  } else {
    wranglerArgs.push("--local");
  }

  const output = execFileSync("bunx", wranglerArgs, {
    cwd: rootDir,
    encoding: "utf8",
  });

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`Unexpected wrangler d1 output: ${output}`);
  }

  if (parsed?.error?.text) {
    throw new Error(parsed.error.text);
  }

  const result = parsed?.[0]?.results;
  if (!Array.isArray(result)) {
    throw new Error(`Unexpected wrangler d1 output: ${output}`);
  }
  return result;
}

async function loadMemberships() {
  if (membershipsJsonPath) {
    const raw = await readFile(membershipsJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("--memberships-json must contain a JSON array");
    }
    return parsed;
  }

  return queryD1(
    "SELECT u.auth_id AS authId, u.email AS email, u.role AS role, h.id AS householdId, h.name AS householdName, h.clerk_org_id AS clerkOrgId FROM users u INNER JOIN households h ON u.household_id = h.id WHERE u.deleted_at IS NULL ORDER BY h.name, u.role, u.email;"
  );
}

function parseClerkHouseholdMetadata(publicMetadata) {
  if (!publicMetadata || typeof publicMetadata !== "object") {
    return {};
  }

  const record = publicMetadata;
  const householdId = record.householdId;
  const householdName = record.householdName;

  return {
    householdId:
      typeof householdId === "string" && householdId.length > 0
        ? householdId
        : undefined,
    householdName:
      typeof householdName === "string" && householdName.length > 0
        ? householdName
        : undefined,
  };
}

async function main() {
  const secretKey = requireSecretKey();
  const isLiveKey = secretKey.startsWith("sk_live_");

  if (remote && apply && !isLiveKey) {
    console.error(
      "error: --remote --apply requires a live Clerk secret key (sk_live_)."
    );
    console.error(
      "This cloud agent/dev 1Password Environment uses test keys and cannot update production users."
    );
    process.exit(1);
  }

  const memberships = await loadMemberships();

  if (memberships.length === 0) {
    console.log("No active household memberships found.");
    return;
  }

  console.log(
    `${apply ? "Applying" : "Dry-run"} Clerk household metadata backfill for ${memberships.length} user(s) (${remote ? "remote" : "local"} D1).`
  );

  const clerk = createClerkClient({ secretKey });
  let alreadySynced = 0;
  let updated = 0;
  let missingInClerk = 0;
  let failed = 0;

  for (const membership of memberships) {
    const expected = {
      householdId: membership.householdId,
      householdName: membership.householdName,
    };

    let clerkUser;
    try {
      clerkUser = await clerk.users.getUser(membership.authId);
    } catch (error) {
      missingInClerk += 1;
      failed += 1;
      console.error(
        `FAIL ${membership.email} (${membership.authId}): Clerk user lookup failed`,
        error
      );
      continue;
    }

    const current = parseClerkHouseholdMetadata(clerkUser.publicMetadata);
    const needsUpdate =
      current.householdId !== expected.householdId ||
      current.householdName !== expected.householdName;

    if (!needsUpdate) {
      alreadySynced += 1;
      console.log(
        `OK   ${membership.email} (${membership.role}) already has ${expected.householdId} / ${expected.householdName}`
      );
      continue;
    }

    console.log(
      `${apply ? "SYNC" : "PLAN"} ${membership.email} (${membership.role}) ${membership.authId}`
    );
    console.log(
      `     D1: ${expected.householdId} / ${expected.householdName} (legacy clerk_org_id=${membership.clerkOrgId})`
    );
    console.log(
      `     Clerk: ${current.householdId ?? "<missing>"} / ${current.householdName ?? "<missing>"}`
    );

    if (!apply) {
      updated += 1;
      continue;
    }

    try {
      await clerk.users.updateUserMetadata(membership.authId, {
        publicMetadata: {
          householdId: expected.householdId,
          householdName: expected.householdName,
        },
      });
      updated += 1;
      console.log(`     updated Clerk publicMetadata`);
    } catch (error) {
      failed += 1;
      console.error(`     update failed`, error);
    }
  }

  console.log("");
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        database: remote ? "remote" : "local",
        total: memberships.length,
        alreadySynced,
        pendingOrUpdated: updated,
        missingInClerk,
        failed,
      },
      null,
      2
    )
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
