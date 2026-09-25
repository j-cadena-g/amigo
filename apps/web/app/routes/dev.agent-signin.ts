import type { Route } from "./+types/dev.agent-signin";
import { handleApiRoute } from "@/server/api/route";
import { handleDevAgentSignin } from "@/server/api/dev-agent-signin";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "none", handler: handleDevAgentSignin });
