import { createContext, useContext } from "react";
import { DEFAULT_LOCALE } from "@/app/lib/locale";

/**
 * The viewer's locale for numbers and dates. The root layout provides the
 * value its loader resolved once per request, so server and client render the
 * same strings; anything rendered outside it gets the default.
 */
export const LocaleContext = createContext<string>(DEFAULT_LOCALE);

export function useLocale(): string {
  return useContext(LocaleContext);
}
