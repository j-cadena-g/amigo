import type { Route } from "./+types/api.transactions";
import { handleApiRoute } from "@/server/api/route";
import { handleTransactionsRequest } from "@/server/api/transactions";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleTransactionsRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleTransactionsRequest });
