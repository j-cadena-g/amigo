import type { Route } from "./+types/api.recurring";
import { handleApiRoute } from "@/server/api/route";
import { handleRecurringRequest } from "@/server/api/recurring";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleRecurringRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleRecurringRequest });
