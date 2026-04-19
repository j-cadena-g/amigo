import type { Route } from "./+types/api.restore";
import { handleApiRoute } from "@/server/api/route";
import { handleRestoreRequest } from "@/server/api/restore";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "none", handler: handleRestoreRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "none", handler: handleRestoreRequest });
