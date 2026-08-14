#!/usr/bin/env node
/**
 * Prints a one-time Clerk sign-in URL for local agentic browser work.
 * stdout is the URL only. Do not copy it into logs, PRs, or chat.
 */

import { createClerkClient } from "@clerk/backend";
import {
  assertDevelopmentAgentSignin,
  createAgentSigninUrl,
} from "./lib/agent-signin.mjs";

const { email, origin, secretKey } = assertDevelopmentAgentSignin();
const clerk = createClerkClient({ secretKey });
const result = await createAgentSigninUrl({ clerk, email, origin });

process.stderr.write(
  `ok: ${result.kind} URL (one-time; pass to the browser immediately)\n`,
);
process.stdout.write(`${result.url}\n`);
