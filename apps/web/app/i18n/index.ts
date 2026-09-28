import { createContext, useContext } from "react";
import { UI_LANGUAGES, type UiLanguage } from "@amigo/db";
import type { Catalog } from "./define";
import { accounts } from "./messages/accounts";
import { audit } from "./messages/audit";
import { budgets } from "./messages/budgets";
import { calendar } from "./messages/calendar";
import { categories } from "./messages/categories";
import { common } from "./messages/common";
import { dashboard } from "./messages/dashboard";
import { groceries } from "./messages/groceries";
import { household } from "./messages/household";
import { imports } from "./messages/imports";
import { nav } from "./messages/nav";
import { notifications } from "./messages/notifications";
import { onboarding } from "./messages/onboarding";
import { recurring } from "./messages/recurring";
import { settings } from "./messages/settings";
import { transactions } from "./messages/transactions";

const CATALOGS = {
  accounts,
  audit,
  budgets,
  calendar,
  categories,
  common,
  dashboard,
  groceries,
  household,
  imports,
  nav,
  notifications,
  onboarding,
  recurring,
  settings,
  transactions,
} satisfies Record<string, Catalog<unknown>>;

type Catalogs = typeof CATALOGS;

/** All interface copy for one language, grouped by feature. */
export type Messages = { [K in keyof Catalogs]: Catalogs[K]["en"] };

function messagesIn(language: UiLanguage): Messages {
  return Object.fromEntries(
    Object.entries(CATALOGS).map(([name, catalog]) => [name, catalog[language]])
  ) as Messages;
}

const MESSAGES: Record<UiLanguage, Messages> = {
  en: messagesIn("en"),
  es: messagesIn("es"),
};

export const DEFAULT_LANGUAGE: UiLanguage = "en";

export function isUiLanguage(value: unknown): value is UiLanguage {
  return (UI_LANGUAGES as readonly unknown[]).includes(value);
}

/** Copy for a language, for code outside React (route `meta`, plain helpers). */
export function messagesFor(language: UiLanguage): Messages {
  return MESSAGES[language];
}

/**
 * The viewer's interface language. The root layout provides the value its
 * loader resolved, so server and client render the same copy.
 */
export const LanguageContext = createContext<UiLanguage>(DEFAULT_LANGUAGE);

export function useLanguage(): UiLanguage {
  return useContext(LanguageContext);
}

/** Interface copy in the viewer's language: `const t = useT(); t.nav.home`. */
export function useT(): Messages {
  return MESSAGES[useLanguage()];
}

/** Native names, so a reader finds theirs without knowing the current language. */
export const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = {
  en: "English",
  es: "Español",
};

/**
 * `<title>` for a route's `meta`, in the language the root loader resolved:
 * `export const meta: Route.MetaFunction = ({ matches }) => pageTitle(matches, (t) => t.nav.settings)`.
 */
export function pageTitle(
  matches: readonly ({ id: string; loaderData?: unknown } | undefined)[],
  pick: (t: Messages) => string
): { title: string }[] {
  const root = matches.find((match) => match?.id === "root");
  const language = (root?.loaderData as { language?: unknown } | undefined)?.language;
  const t = MESSAGES[isUiLanguage(language) ? language : DEFAULT_LANGUAGE];
  return [{ title: `${pick(t)} · amigo` }];
}
