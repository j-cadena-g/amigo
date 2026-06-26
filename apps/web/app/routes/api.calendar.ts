import type { Route } from "./+types/api.calendar";
import { handleApiRoute } from "@/server/api/route";
import { handleCalendarRequest } from "@/server/api/calendar";

export const loader = (args: Route.LoaderArgs) =>
  handleApiRoute(args, { auth: "strict", handler: handleCalendarRequest });
