import type { Route } from "./+types/api.invites";
import { handleApiRoute } from "@/server/api/route";
import { handleInvitesRequest } from "@/server/api/invites";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleInvitesRequest });

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleInvitesRequest });
