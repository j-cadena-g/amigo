import { getDb, exchangeRates, eq, and } from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";
import type { Env } from "../env";

const EXCHANGE_RATE_API = "https://api.exchangerate-api.com/v4/latest";
const CACHE_TTL = 86400; // 24 hours

export interface ExchangeRateResult {
  rate: number;
  date: string;
  cached: boolean;
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
function getTodayDateStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Fetch exchange rates from external API.
 */
async function fetchFromApi(
  baseCurrency: CurrencyCode
): Promise<Record<string, number>> {
  const response = await fetch(`${EXCHANGE_RATE_API}/${baseCurrency}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
  }
  const data = (await response.json()) as { rates: Record<string, number> };
  return data.rates;
}

/**
 * Get the current exchange rate using a 3-tier cache hierarchy:
 * 1. Cache API (hot cache, per-colo, free)
 * 2. D1 (persistent historical storage)
 * 3. External API (fallback)
 */
export async function getExchangeRate(
  env: Env,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<ExchangeRateResult> {
  if (fromCurrency === toCurrency) {
    return { rate: 1, date: getTodayDateStr(), cached: true };
  }

  const dateStr = getTodayDateStr();
  const cacheUrl = `https://cache.internal/exchange-rate/${fromCurrency}/${toCurrency}/${dateStr}`;
  // Workers Cache API — `caches.default` is Cloudflare-specific
  const cache = (caches as unknown as { default: Cache }).default;

  // 1. Check Cache API
  const cached = await cache.match(cacheUrl);
  if (cached) {
    const { rate } = (await cached.json()) as { rate: number };
    return { rate, date: dateStr, cached: true };
  }

  // 2. Check D1
  const db = getDb(env.DB);
  const dbRate = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.baseCurrency, fromCurrency),
        eq(exchangeRates.targetCurrency, toCurrency),
        eq(exchangeRates.date, dateStr)
      )
    )
    .get();

  if (dbRate) {
    await cache.put(
      cacheUrl,
      new Response(JSON.stringify({ rate: dbRate.rate }), {
        headers: { "Cache-Control": `max-age=${CACHE_TTL}` },
      })
    );
    return { rate: dbRate.rate, date: dateStr, cached: true };
  }

  // 3. Fetch from external API
  const rates = await fetchFromApi(fromCurrency);
  const rate = rates[toCurrency];
  if (!rate) {
    throw new Error(`Rate not found: ${fromCurrency} → ${toCurrency}`);
  }

  // Store in D1 + Cache API
  await db
    .insert(exchangeRates)
    .values({
      baseCurrency: fromCurrency,
      targetCurrency: toCurrency,
      date: dateStr,
      rate,
    })
    .onConflictDoNothing();

  await cache.put(
    cacheUrl,
    new Response(JSON.stringify({ rate }), {
      headers: { "Cache-Control": `max-age=${CACHE_TTL}` },
    })
  );

  return { rate, date: dateStr, cached: false };
}

/**
 * Get historical exchange rate for a specific date.
 */
export async function getHistoricalExchangeRate(
  env: Env,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  date: string
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;

  const db = getDb(env.DB);
  const dbRate = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.baseCurrency, fromCurrency),
        eq(exchangeRates.targetCurrency, toCurrency),
        eq(exchangeRates.date, date)
      )
    )
    .get();

  return dbRate?.rate ?? null;
}

/**
 * Get exchange rate for storing with a record.
 * Returns the rate to home currency, or null if same currency.
 */
export async function getExchangeRateForRecord(
  env: Env,
  recordCurrency: CurrencyCode,
  homeCurrency: CurrencyCode
): Promise<number | null> {
  if (recordCurrency === homeCurrency) return null;
  const { rate } = await getExchangeRate(env, recordCurrency, homeCurrency);
  return rate;
}
