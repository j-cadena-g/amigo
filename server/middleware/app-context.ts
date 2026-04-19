import { getAuth } from "@clerk/react-router/server";
import type { MiddlewareFunction } from "react-router";
import { getClerkIdentity } from "../lib/clerk";
import { createCspNonce } from "../lib/security";
import { resolveSession } from "../lib/session";

export const appContextMiddleware: MiddlewareFunction<Response> = async (
  args,
  next
) => {
  const app = args.context.app;
  const env = args.context.cloudflare.env;
  const existingNonce =
    typeof app?.cspNonce === "string"
      ? app.cspNonce
      : "";
  const cspNonce = existingNonce || createCspNonce();

  app.cspNonce = cspNonce;
  app.sessionStatus = "unauthenticated";
  delete app.session;

  try {
    const auth = await getAuth(args as Parameters<typeof getAuth>[0]);
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
          orgId: identity.orgId,
        }
      );

      app.cspNonce = cspNonce;
      app.sessionStatus = result.status;
      app.session =
        result.status === "authenticated" ? result.session : undefined;
    }
  } catch {
    app.cspNonce = cspNonce;
    app.sessionStatus = "unauthenticated";
    delete app.session;
  }

  return next();
};
