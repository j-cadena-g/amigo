import type { Route } from "./+types/api.categories";
import { handleApiRoute } from "@/server/api/route";
import { handleCategoriesRequest } from "@/server/api/categories";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleCategoriesRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleCategoriesRequest });
