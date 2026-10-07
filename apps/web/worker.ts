import { createClerkClient } from "@clerk/backend";
import { createRequestHandler } from "react-router";
import { createRouterLoadContext, getApp } from "./router-context";
import type { Cloudflare } from "./router-context";
import { HouseholdDO } from "./server/durable-objects/household";
import { getDb, auditLogs, lt } from "@amigo/db";
import { processDueRecurringRules } from "./server/lib/recurring-processor";
import {
  processRecurringReminders,
  pruneRecurringReminderDeliveries,
} from "./server/lib/recurring-reminders";
import {
  processTransactionReminders,
  pruneTransactionReminderDeliveries,
} from "./server/lib/transaction-reminders";
import { cleanupStalePushSubscriptions } from "./server/api/push";
import { cleanupStaleGrocerySyncMutations } from "./server/api/sync";
import { purgeOldPurchasedGroceryItems } from "./server/api/groceries";
import { pruneAiUsage } from "./server/lib/ai-budget";
import type { Env } from "./server/env";
import { getClerkIdentity } from "./server/lib/clerk";
import { clerkTokenAuthOptions } from "./server/lib/clerk-auth-options";
import { jsonError } from "./server/lib/errors";
import { getRequestHandlerMode } from "./server/lib/request-handler-mode";
import { buildSecurityHeaders } from "./server/lib/security";
import { resolveSession } from "./server/lib/session";
import { requestMatchesAllowedOrigin } from "./server/lib/request-origin";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  getRequestHandlerMode(import.meta.env?.MODE)
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
      cspNonce: getApp(loadContext).cspNonce,
      clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY,
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
      // Weekly pruning (Sunday 3 AM UTC) — audit logs and purchased groceries retain 90 days
      const db = getDb(env.DB);
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      try {
        await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
        await cleanupStalePushSubscriptions(env);
        await cleanupStaleGrocerySyncMutations(env);
        await pruneAiUsage(db);
        await pruneRecurringReminderDeliveries(db, cutoff);
        await pruneTransactionReminderDeliveries(db, cutoff);
      } finally {
        // Groceries still clear if an earlier cleanup fails; that error is rethrown after.
        const result = await purgeOldPurchasedGroceryItems(env);
        console.log(
          JSON.stringify({
            message: "purgeOldPurchasedGroceryItems completed",
            cron: event.cron,
            deleted: result.deletedCount,
            failed: result.failed,
          })
        );
      }
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
            failed: result.failed,
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
    } else if (event.cron === "* * * * *") {
      // Let both independent reminder types finish, even if one scheduler fails.
      const [transactionResult, recurringResult] = await Promise.allSettled([
        processTransactionReminders(env),
        processRecurringReminders(env),
      ]);
      const outcome = (result: PromiseSettledResult<unknown>) =>
        result.status === "fulfilled"
          ? result.value
          : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      const failed = transactionResult.status === "rejected" || recurringResult.status === "rejected";
      // Log every run, including a failed one, before rethrowing.
      (failed ? console.error : console.log)(
        JSON.stringify({
          message: failed ? "reminders failed" : "reminders completed",
          cron: event.cron,
          transactions: outcome(transactionResult),
          recurring: outcome(recurringResult),
        })
      );
      if (transactionResult.status === "rejected") throw transactionResult.reason;
      if (recurringResult.status === "rejected") throw recurringResult.reason;
    } else {
      console.warn(
        JSON.stringify({
          message: "scheduled: unhandled cron",
          cron: event.cron,
        })
      );
    }
  },
};

export { HouseholdDO };

async function handleWebSocketUpgrade(request: Request, env: Env) {
  if (!requestMatchesAllowedOrigin(request, env.APP_ORIGIN)) {
    return jsonError("Invalid request origin", "PERMISSION_DENIED");
  }

  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
  const authState = await clerk.authenticateRequest(request, clerkTokenAuthOptions(env.APP_ORIGIN));
  const identity = getClerkIdentity(authState.toAuth());

  if (!identity) {
    return jsonError("Unauthorized", "UNAUTHORIZED");
  }

  const result = await resolveSession(
    identity.userId,
    env.DB,
    env.CACHE,
    env.CLERK_SECRET_KEY,
    {
      email: identity.email,
      name: identity.name,
    },
    {
      appEnv: env.APP_ENV,
      agentLoginEmail: env.AGENT_LOGIN_EMAIL,
    }
  );

  if (result.status === "needs_setup") {
    return jsonError("Household setup required", "PERMISSION_DENIED");
  }

  if (result.status === "revoked") {
    return jsonError("Account access revoked", "PERMISSION_DENIED");
  }

  if (result.status !== "authenticated") {
    return jsonError("Unauthorized", "UNAUTHORIZED");
  }

  const id = env.HOUSEHOLD.idFromName(result.session.householdId);
  const stub = env.HOUSEHOLD.get(id);

  return stub.fetch(
    new Request(`https://do/ws?userId=${result.session.userId}`, {
      headers: request.headers,
    })
  );
}
