import type { Route } from "./+types/api.health";
import { handleApiRoute } from "@/server/api/route";
import { handleHealthRequest } from "@/server/api/health";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "none", handler: handleHealthRequest });
