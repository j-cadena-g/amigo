import { createClerkClient } from "@clerk/backend";
import { createRequestHandler } from "react-router";
import { createRouterLoadContext } from "./router-context";
import type { Cloudflare } from "./router-context";
import { HouseholdDO } from "./server/durable-objects/household";
import { getDb, auditLogs, lt } from "@amigo/db";
import { processDueRecurringRules } from "./server/lib/recurring-processor";
import type { Env } from "./server/env";
import { getClerkIdentity } from "./server/lib/clerk";
import { getRequestHandlerMode } from "./server/lib/request-handler-mode";
import { buildSecurityHeaders } from "./server/lib/security";
import { resolveSession } from "./server/lib/session";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  getRequestHandlerMode(import.meta.env.MODE)
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return handleWebSocketUpgrade(request, env);
    }

    const loadContext = createRouterLoadContext({
      cloudflare: {
        env,
        cf: request.cf,
        ctx,
        caches: globalThis.caches as unknown as Cloudflare["caches"],
      },
      app: {
        cspNonce: "",
        sessionStatus: "unauthenticated",
      },
    });

    const response = await requestHandler(request, loadContext);
    const securityHeaders = buildSecurityHeaders({
      appEnv: env.APP_ENV,
      cspNonce: loadContext.app.cspNonce,
    });

    for (const [name, value] of Object.entries(securityHeaders)) {
      response.headers.set(name, value);
    }

    return response;
  },

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Each wrangler.jsonc cron fires separately; Sundays get both triggers at different
    // times for different work (audit prune vs recurring), not duplicate recurring runs.
    if (event.cron === "0 3 * * SUN") {
      // Weekly audit log pruning (Sunday 3 AM UTC) — retain 90 days
      const db = getDb(env.DB);
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
    } else if (event.cron === "23 4 * * *") {
      // Daily recurring postings (4:23 AM UTC), idempotent by deterministic txn ids.
      // Await directly so failures propagate to the scheduled handler (waitUntil would not).
      const db = getDb(env.DB);
      try {
        const result = await processDueRecurringRules(env, db, {
          mode: "all_households",
        });
        console.log(
          JSON.stringify({
            message: "processDueRecurringRules completed",
            cron: event.cron,
            mode: "all_households",
            processed: result.processed,
          })
        );
      } catch (err) {
        console.error(
          JSON.stringify({
            message: "processDueRecurringRules failed",
            cron: event.cron,
            mode: "all_households",
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          })
        );
        throw err;
      }
    } else {
      console.warn(
        JSON.stringify({ message: "scheduled: unhandled cron", cron: event.cron })
      );
    }
  },
};

export { HouseholdDO };

async function handleWebSocketUpgrade(request: Request, env: Env) {
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
  const authState = await clerk.authenticateRequest(request, {
    acceptsToken: "any",
  });
  const identity = getClerkIdentity(authState.toAuth());

  if (!identity) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (result.status === "no_org") {
    return Response.json(
      { error: "Organization membership required" },
      { status: 403 }
    );
  }

  if (result.status === "needs_setup") {
    return Response.json(
      { error: "Household setup required" },
      { status: 403 }
    );
  }

  if (result.status === "revoked") {
    return Response.json(
      { error: "Account access revoked" },
      { status: 403 }
    );
  }

  if (result.status !== "authenticated") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = env.HOUSEHOLD.idFromName(result.session.householdId);
  const stub = env.HOUSEHOLD.get(id);

  return stub.fetch(
    new Request(`https://do/ws?userId=${result.session.userId}`, {
      headers: request.headers,
    })
  );
}
