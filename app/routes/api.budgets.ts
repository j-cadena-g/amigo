import type { Route } from "./+types/api.budgets";
import { handleApiRoute } from "@/server/api/route";
import { handleBudgetsRequest } from "@/server/api/budgets";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleBudgetsRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleBudgetsRequest });
