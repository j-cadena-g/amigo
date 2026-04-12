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
type TransactionsListType = z.infer<typeof transactionsTypeSchema>;

export function parseTransactionsListQuery(query: {
  page?: string;
  limit?: string;
  type?: string;
}): {
  page: number;
  limit: number;
  type?: TransactionsListType;
} {
  let type: TransactionsListType | undefined;
  if (query.type) {
    const parsed = transactionsTypeSchema.safeParse(query.type);
    if (parsed.success) {
      type = parsed.data;
    }
  }

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
    type,
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
