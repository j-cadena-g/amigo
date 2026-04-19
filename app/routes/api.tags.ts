import type { Route } from "./+types/api.tags";
import { handleApiRoute } from "@/server/api/route";
import { handleTagsRequest } from "@/server/api/tags";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleTagsRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleTagsRequest });
