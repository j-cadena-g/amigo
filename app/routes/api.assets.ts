import type { Route } from "./+types/api.assets";
import { handleApiRoute } from "@/server/api/route";
import { handleAssetsRequest } from "@/server/api/assets";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleAssetsRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleAssetsRequest });
