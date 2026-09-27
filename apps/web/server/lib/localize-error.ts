import type { UiLanguage } from "@amigo/db";
import type { RouterLoadContext } from "../../router-context";
import { loadViewerRegion } from "@/app/lib/locale.server";
import { translateServerMessage } from "./server-messages";

/**
 * Translate an API error response's `{ error }` into the viewer's language.
 * Successful responses and non-JSON bodies pass through untouched, so the
 * language lookup only runs when something went wrong.
 */
export async function localizeErrorResponse(
  response: Response,
  context: RouterLoadContext,
  request: Request
): Promise<Response> {
  if (response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
    return response;
  }

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  if (!body || typeof body !== "object") return response;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "string") return response;

  let language: UiLanguage;
  try {
    language = (await loadViewerRegion(context, request)).language;
  } catch {
    // Localization never costs the caller their error: keep the English one.
    return response;
  }
  const translated = translateServerMessage(error, language);
  if (translated === error) return response;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(JSON.stringify({ ...body, error: translated }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Translate `error` on each failed item of a batch response (grocery sync),
 * which succeeds overall and so skips `localizeErrorResponse`. Looks up the
 * language only when some item failed.
 */
export async function localizeResultErrors<T extends { error?: string }>(
  results: T[],
  context: RouterLoadContext,
  request: Request
): Promise<T[]> {
  if (!results.some((result) => typeof result.error === "string")) return results;
  let language: UiLanguage;
  try {
    language = (await loadViewerRegion(context, request)).language;
  } catch {
    return results;
  }
  if (language === "en") return results;
  return results.map((result) =>
    typeof result.error === "string"
      ? { ...result, error: translateServerMessage(result.error, language) }
      : result
  );
}
