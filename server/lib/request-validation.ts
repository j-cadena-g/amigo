import { z } from "zod";

export const DEFAULT_TRANSACTIONS_PAGE = 1;
export const DEFAULT_TRANSACTIONS_LIMIT = 20;
export const MAX_TRANSACTIONS_LIMIT = 100;

function clampInt(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number" ? value : value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

const transactionsTypeSchema = z.enum(["income", "expense"]);

export function parseTransactionsListQuery(query: {
  page?: string;
  limit?: string;
  type?: string;
}) {
  return {
    page: clampInt(
      query.page,
      DEFAULT_TRANSACTIONS_PAGE,
      1,
      Number.MAX_SAFE_INTEGER
    ),
    limit: clampInt(
      query.limit,
      DEFAULT_TRANSACTIONS_LIMIT,
      1,
      MAX_TRANSACTIONS_LIMIT
    ),
    type:
      query.type && transactionsTypeSchema.safeParse(query.type).success
        ? query.type
        : undefined,
  } as {
    page: number;
    limit: number;
    type?: z.infer<typeof transactionsTypeSchema>;
  };
}

const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export function parseCalendarQuery(query: {
  year?: string;
  month?: string;
}) {
  return calendarQuerySchema.parse(query);
}
