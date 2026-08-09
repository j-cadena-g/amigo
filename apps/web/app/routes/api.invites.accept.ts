import type { Route } from "./+types/api.invites.accept";
import { handleApiRoute } from "@/server/api/route";
import { handleInviteAcceptRequest } from "@/server/api/invites";

export const action = (args: Route.ActionArgs) =>
  handleApiRoute(args, { auth: "clerk", handler: handleInviteAcceptRequest });
