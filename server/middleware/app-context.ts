import { getAuth } from "@clerk/react-router/server";
import type { MiddlewareFunction } from "react-router";
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

    if (auth.userId) {
      const result = await resolveSession(
        auth.userId,
        env.DB,
        env.CACHE,
        env.CLERK_SECRET_KEY,
        {
          email: auth.sessionClaims?.email as string | undefined,
          name: auth.sessionClaims?.name as string | undefined,
          orgId: auth.orgId ?? undefined,
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
