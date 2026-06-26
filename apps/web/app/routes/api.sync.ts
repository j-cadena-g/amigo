import type { Route } from "./+types/api.sync";
import { handleApiRoute } from "@/server/api/route";
import { handleSyncRequest } from "@/server/api/sync";

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleSyncRequest });
