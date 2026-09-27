import type { FormatLocale, UiLanguage } from "@amigo/db";
import { and, eq, getDb, households, scopeToHousehold, users } from "@amigo/db";
import { getApp, type RouterLoadContext } from "../../router-context";
import { logServerError } from "../../server/lib/errors";
import { getEnv } from "@/app/lib/session.server";
import { resolveLanguage, resolveLocale } from "@/app/lib/locale";

export interface ViewerRegion {
  /** Number and date format. */
  locale: FormatLocale;
  /** Interface language. */
  language: UiLanguage;
}

function region(
  saved: { locale?: string | null; language?: string | null; homeCurrency?: string | null },
  acceptLanguage: string | null
): ViewerRegion {
  const locale = resolveLocale({
    preferred: saved.locale,
    homeCurrency: saved.homeCurrency,
    acceptLanguage,
    language: saved.language,
  });
  return { locale, language: resolveLanguage({ preferred: saved.language, locale }) };
}

/** Resolve the viewer's format and language for the root loader. */
export async function loadViewerRegion(
  context: RouterLoadContext,
  request: Request
): Promise<ViewerRegion> {
  const acceptLanguage = request.headers.get("Accept-Language");
  const session = getApp(context).session;
  if (!session) return region({}, acceptLanguage);

  try {
    const row = await getDb(getEnv(context).DB)
      .select({
        locale: users.locale,
        language: users.language,
        homeCurrency: households.homeCurrency,
      })
      .from(users)
      .innerJoin(households, eq(households.id, users.householdId))
      .where(
        and(eq(users.id, session.userId), scopeToHousehold(users.householdId, session.householdId))
      )
      .get();
    return region(row ?? {}, acceptLanguage);
  } catch (error) {
    // Fall back to the browser's language rather than failing the page.
    logServerError("loadViewerRegion", error, { userId: session.userId });
    return region({}, acceptLanguage);
  }
}
