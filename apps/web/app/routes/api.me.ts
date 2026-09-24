import type { Route } from "./+types/api.me";
import { handleApiRoute } from "@/server/api/route";
import { handleMeRequest } from "@/server/api/me";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleMeRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleMeRequest });
