import type { Route } from "./+types/api.push";
import { handleApiRoute } from "@/server/api/route";
import { handlePushRequest } from "@/server/api/push";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handlePushRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handlePushRequest });
