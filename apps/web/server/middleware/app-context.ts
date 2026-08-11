import { getAuth } from "@clerk/react-router/server";
import type { MiddlewareFunction } from "react-router";
import { getApp, getCloudflare } from "../../router-context";
import { getClerkIdentity } from "../lib/clerk";
import { clerkSessionAuthOptions } from "../lib/clerk-auth-options";
import { createCspNonce } from "../lib/security";
import { resolveSession } from "../lib/session";

export const appContextMiddleware: MiddlewareFunction<Response> = async (
  args,
  next
) => {
  const app = getApp(args.context);
  const env = getCloudflare(args.context).env;
  const existingNonce =
    typeof app?.cspNonce === "string"
      ? app.cspNonce
      : "";
  const cspNonce = existingNonce || createCspNonce();

  app.cspNonce = cspNonce;
  app.sessionStatus = "unauthenticated";
  delete app.session;

  const auth = await getAuth(
    args as Parameters<typeof getAuth>[0],
    clerkSessionAuthOptions
  );
  const identity = getClerkIdentity(auth);

  if (identity) {
    const result = await resolveSession(
      identity.userId,
      env.DB,
      env.CACHE,
      env.CLERK_SECRET_KEY,
      {
        email: identity.email,
        name: identity.name,
      }
    );

    app.sessionStatus = result.status;
    app.session =
      result.status === "authenticated" ? result.session : undefined;
  } else {
    app.sessionStatus = "unauthenticated";
    delete app.session;
  }

  return next();
};
