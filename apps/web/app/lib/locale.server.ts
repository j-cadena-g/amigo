import { and, eq, getDb, households, scopeToHousehold, users } from "@amigo/db";
import { getApp, type RouterLoadContext } from "../../router-context";
import { logServerError } from "../../server/lib/errors";
import { getEnv } from "@/app/lib/session.server";
import { resolveLocale } from "@/app/lib/locale";

/** Resolve the viewer's formatting locale for the root loader. */
export async function loadLocale(
  context: RouterLoadContext,
  request: Request
): Promise<string> {
  const acceptLanguage = request.headers.get("Accept-Language");
  const session = getApp(context).session;
  if (!session) return resolveLocale({ acceptLanguage });

  try {
    const row = await getDb(getEnv(context).DB)
      .select({ locale: users.locale, homeCurrency: households.homeCurrency })
      .from(users)
      .innerJoin(households, eq(households.id, users.householdId))
      .where(
        and(eq(users.id, session.userId), scopeToHousehold(users.householdId, session.householdId))
      )
      .get();
    return resolveLocale({
      preferred: row?.locale,
      homeCurrency: row?.homeCurrency,
      acceptLanguage,
    });
  } catch (error) {
    // Formatting falls back to the browser's language rather than failing the page.
    logServerError("loadLocale", error, { userId: session.userId });
    return resolveLocale({ acceptLanguage });
  }
}
