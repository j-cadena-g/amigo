import { getDb } from "@amigo/db";
import { loadDashboardData } from "../lib/dashboard-data";
import { enforceRateLimit, ROUTE_RATE_LIMITS } from "../middleware/rate-limit";
import type { ApiHandler } from "./route";

/**
 * JSON equivalent of the dashboard page loader: household spending/income/net,
 * net worth, budget progress, upcoming recurring, and calendar aggregation.
 * Reuses loadDashboardData so the API and SSR page stay in lockstep.
 */
export const handleDashboardRequest: ApiHandler = async ({
  env,
  request,
  session,
}) => {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  await enforceRateLimit(
    env,
    `${session!.userId}:dashboard:get`,
    ROUTE_RATE_LIMITS.dashboard.get
  );

  const db = getDb(env.DB);
  const data = await loadDashboardData(db, env, session!);

  return Response.json(data);
};
