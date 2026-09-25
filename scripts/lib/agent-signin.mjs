import { AMIGO_DEV_ORIGIN } from "./dev-origin.mjs";

const AGENT_NAME = "amigo-local-agent";
const TICKET_TTL_SECONDS = 120;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function assertDevelopmentAgentSignin(env = process.env) {
  const appEnv = env.APP_ENV?.trim();
  if (appEnv !== "development") {
    throw new Error(
      "agent sign-in URLs are only available when APP_ENV=development",
    );
  }

  const secretKey = env.CLERK_SECRET_KEY?.trim();
  const email = env.AGENT_LOGIN_EMAIL?.trim();
  const origin = (env.APP_ORIGIN?.trim() || AMIGO_DEV_ORIGIN).replace(
    /\/+$/,
    "",
  );

  if (!secretKey) {
    throw new Error("missing CLERK_SECRET_KEY");
  }
  if (!email) {
    throw new Error("missing AGENT_LOGIN_EMAIL");
  }

  return { email, origin, secretKey };
}

/**
 * <SignIn> reads __clerk_ticket from the query string; after a `#` it is
 * ignored and the form just asks for an email.
 *
 * @param {string} origin
 * @param {string} token
 */
export function buildSignInTicketUrl(origin, token) {
  const base = origin.replace(/\/+$/, "");
  return `${base}/?__clerk_ticket=${encodeURIComponent(token)}`;
}

/**
 * @param {string} url
 * @param {string | undefined} testingToken
 */
export function withTestingToken(url, testingToken) {
  if (!testingToken) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("__clerk_testing_token", testingToken);
  return parsed.toString();
}

async function readTestingToken(clerk) {
  try {
    const testing = await clerk.testingTokens.createTestingToken();
    return testing?.token;
  } catch {
    return undefined;
  }
}

/**
 * @param {{
 *   clerk: {
 *     agentTasks: { create: Function },
 *     testingTokens: { createTestingToken: Function },
 *     users: { getUserList: Function },
 *     signInTokens: { createSignInToken: Function },
 *   },
 *   email: string,
 *   origin: string,
 *   ticketOnly?: boolean,
 * }} params `ticketOnly` skips the Clerk-hosted Agent Task for browsers that
 *   refuse to open Clerk's domain; the ticket URL stays on `origin`.
 */
export async function createAgentSigninUrl({
  clerk,
  email,
  origin,
  ticketOnly = false,
}) {
  const testingToken = await readTestingToken(clerk);

  if (!ticketOnly) {
    try {
      const task = await clerk.agentTasks.create({
        onBehalfOf: { identifier: email },
        permissions: "*",
        agentName: AGENT_NAME,
        taskDescription: "Local agentic sign-in",
        redirectUrl: `${origin}/dashboard`,
      });
      return {
        kind: "agent_task",
        url: withTestingToken(task.url, testingToken),
      };
    } catch {
      // Agent Tasks are experimental; fall back to a short-lived sign-in token.
    }
  }

  const listed = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const user = listed?.data?.[0];
  if (!user?.id) {
    throw new Error(
      `no Clerk user found for AGENT_LOGIN_EMAIL (${email}). Create that user in your Clerk Development instance.`,
    );
  }

  const signInToken = await clerk.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: TICKET_TTL_SECONDS,
  });

  return {
    kind: "ticket",
    url: withTestingToken(
      buildSignInTicketUrl(origin, signInToken.token),
      testingToken,
    ),
  };
}
