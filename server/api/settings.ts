import { eq, getDb, households } from "@amigo/db";
import type { ApiHandler } from "./route";

export const handleSettingsRequest: ApiHandler = async ({
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

  const db = getDb(env.DB);

  const household = await db.query.households.findFirst({
    where: eq(households.id, session!.householdId),
  });

  return Response.json(household);
};
