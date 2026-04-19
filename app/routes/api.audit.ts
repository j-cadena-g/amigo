import type { Route } from "./+types/api.audit";
import { handleApiRoute } from "@/server/api/route";
import { handleAuditRequest } from "@/server/api/audit";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleAuditRequest });
