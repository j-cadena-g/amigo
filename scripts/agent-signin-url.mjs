#!/usr/bin/env node
/**
 * Prints a one-time Clerk sign-in URL for local agentic browser work.
 * stdout is the URL only. Do not copy it into logs, PRs, or chat.
 *
 * --ticket skips the Clerk-hosted Agent Task and prints a localhost sign-in
 * token URL, for browsers that refuse to open Clerk's domain. It expires in
 * 120s, so open it right away.
 */

import { createClerkClient } from "@clerk/backend";
import {
  assertDevelopmentAgentSignin,
  createAgentSigninUrl,
} from "./lib/agent-signin.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const unknown = args.filter((arg) => arg !== "--ticket");
if (unknown.length > 0) {
  throw new Error(`unknown argument: ${unknown.join(" ")} (supported: --ticket)`);
}

const { email, origin, secretKey } = assertDevelopmentAgentSignin();
const clerk = createClerkClient({ secretKey });
const result = await createAgentSigninUrl({
  clerk,
  email,
  origin,
  ticketOnly: args.includes("--ticket"),
});

process.stderr.write(
  `ok: ${result.kind} URL (one-time; pass to the browser immediately)\n`,
);
process.stdout.write(`${result.url}\n`);
