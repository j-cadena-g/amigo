import type { Route } from "./+types/api.accounts";
import { handleApiRoute } from "@/server/api/route";
import { handleAccountsRequest } from "@/server/api/accounts";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleAccountsRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleAccountsRequest });
