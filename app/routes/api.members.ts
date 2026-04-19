import type { Route } from "./+types/api.members";
import { handleApiRoute } from "@/server/api/route";
import { handleMembersRequest } from "@/server/api/members";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleMembersRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleMembersRequest });
