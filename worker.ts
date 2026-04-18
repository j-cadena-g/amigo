import handle from "./react-router-worker";
// @ts-expect-error - virtual module resolved at build time
import * as build from "./build/server";
import app from "./server/index";
import { getLoadContext } from "./load-context";
import { HouseholdDO } from "./server/durable-objects/household";
import { getDb, auditLogs, lt } from "@amigo/db";
import type { Env } from "./server/env";

const server = handle(build, app, { getLoadContext: getLoadContext as never });

export default {
  fetch: server.fetch,

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    if (event.cron === "0 3 * * SUN") {
      // Weekly audit log pruning (Sunday 3 AM UTC) — retain 90 days
      const db = getDb(env.DB);
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
    }
  },
};

export { HouseholdDO };
