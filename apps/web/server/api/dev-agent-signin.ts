import { createClerkClient } from "@clerk/backend";
import type { Env } from "../env";
import type { ApiHandler } from "./route";

/** The redirect spends the token immediately; this only bounds a stray copy. */
const SIGN_IN_TOKEN_TTL_SECONDS = 60;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Local agent browsers only: a development env, a Clerk development key, an
 * agent email, and a request addressed to this machine. Anything else 404s,
 * so a misconfigured deploy still can't hand out sessions. The Host is
 * client-supplied, so the dev server also 404s LAN, tunneled, and cross-site
 * requests before they get here (agentSigninLocalOnly in vite.config.ts).
 */
function isAgentSigninEnabled(
  env: Pick<Env, "APP_ENV" | "CLERK_SECRET_KEY" | "AGENT_LOGIN_EMAIL">,
  url: URL
) {
  return (
    env.APP_ENV === "development" &&
    env.CLERK_SECRET_KEY.startsWith("sk_test_") &&
    Boolean(env.AGENT_LOGIN_EMAIL?.trim()) &&
    LOCAL_HOSTNAMES.has(url.hostname)
  );
}

function redirectNoStore(location: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/**
 * Signs a local browser in as AGENT_LOGIN_EMAIL. The sign-in token is minted
 * here and handed straight to the landing page's <SignIn>, so the agent never
 * handles a token and the browser never leaves localhost (some agent browsers
 * refuse to open Clerk's own domain).
 */
export const handleDevAgentSignin: ApiHandler = async ({
  env,
  request,
  sessionStatus,
}) => {
  if (
    request.method !== "GET" ||
    !isAgentSigninEnabled(env, new URL(request.url))
  ) {
    return new Response("Not found", { status: 404 });
  }

  // Already signed in: the landing loader routes to dashboard, setup, or restore.
  if (sessionStatus !== "unauthenticated") {
    return redirectNoStore("/");
  }

  const email = env.AGENT_LOGIN_EMAIL!.trim();
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const { data } = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const user = data[0];
  if (!user) {
    return new Response(
      `No Clerk user for AGENT_LOGIN_EMAIL (${email}). Create it in your Clerk development instance.`,
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const { token } = await clerk.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
  });
  return redirectNoStore(`/?__clerk_ticket=${encodeURIComponent(token)}`);
};
