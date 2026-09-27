import type { UiLanguage } from "@amigo/db";

/** One namespace of interface copy in every supported language. */
export type Catalog<T> = Record<UiLanguage, T>;

/**
 * English's shape with literal strings widened, so a message like
 * `(n) => n === 1 ? "1 entry" : "entries"` types as returning `string` and
 * Spanish can return its own words.
 */
export type Widen<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R extends string ? string : R
  : T extends string
    ? string
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

/**
 * Declare a namespace's copy with English and Spanish side by side. English
 * defines the shape, so Spanish must provide every key with the same
 * signature: a missing string or a function with different parameters is a
 * type error, not a runtime fallback.
 *
 * Values are plain strings, or functions for copy with numbers, names, plural
 * forms, or inline elements such as links.
 */
export function defineMessages<T>(catalog: {
  en: T;
  es: NoInfer<Widen<T>>;
}): Catalog<Widen<T>> {
  return catalog as Catalog<Widen<T>>;
}
