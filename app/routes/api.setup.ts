import type { Route } from "./+types/api.setup";
import { handleApiRoute } from "@/server/api/route";
import { handleSetupRequest } from "@/server/api/setup";

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "clerk", handler: handleSetupRequest });
