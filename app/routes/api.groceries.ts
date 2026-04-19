import type { Route } from "./+types/api.groceries";
import { handleApiRoute } from "@/server/api/route";
import { handleGroceriesRequest } from "@/server/api/groceries";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleGroceriesRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleGroceriesRequest });
