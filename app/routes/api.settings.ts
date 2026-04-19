import type { Route } from "./+types/api.settings";
import { handleApiRoute } from "@/server/api/route";
import { handleSettingsRequest } from "@/server/api/settings";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleSettingsRequest });
