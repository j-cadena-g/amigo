import type { Route } from "./+types/api.debts";
import { handleApiRoute } from "@/server/api/route";
import { handleDebtsRequest } from "@/server/api/debts";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleDebtsRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleDebtsRequest });
