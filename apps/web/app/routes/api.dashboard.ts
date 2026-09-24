import type { Route } from "./+types/api.dashboard";
import { handleApiRoute } from "@/server/api/route";
import { handleDashboardRequest } from "@/server/api/dashboard";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleDashboardRequest });
