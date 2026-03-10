import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  transactions,
  groceryItems,
  scopeToHousehold,
  eq,
  and,
  isNull,
  isNotNull,
  gte,
  lte,
  sql,
} from "@amigo/db";
import type { CurrencyCode } from "@amigo/db";
import { Calendar as CalendarView, type CalendarEvent } from "@/app/components/calendar";
import { formatCents } from "@/app/lib/currency";
import {
  ArrowDownRight,
  ArrowUpRight,
  ShoppingCart,
  Receipt,
} from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");

  const now = new Date();
  const year = monthParam
    ? parseInt(monthParam.split("-")[0]!)
    : now.getFullYear();
  const month = monthParam
    ? parseInt(monthParam.split("-")[1]!) - 1
    : now.getMonth();

  const start = new Date(year, month, 1).toISOString().split("T")[0]!;
  const end = new Date(year, month + 1, 0).toISOString().split("T")[0]!;

  const events: CalendarEvent[] = [];

  // All queries in parallel
  const [txns, groceries, monthExpenses, monthIncome, groceryPurchaseCount, household] =
    await Promise.all([
      // Transactions for the month
      db.query.transactions.findMany({
        where: and(
          scopeToHousehold(transactions.householdId, session.householdId),
          isNull(transactions.deletedAt),
          gte(transactions.date, start),
          lte(transactions.date, end)
        ),
      }),
      // Grocery purchases grouped by date
      db
        .select({
          date: sql<string>`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
          count: sql<number>`COUNT(*)`,
        })
        .from(groceryItems)
        .where(
          and(
            scopeToHousehold(groceryItems.householdId, session.householdId),
            eq(groceryItems.isPurchased, true),
            isNotNull(groceryItems.purchasedAt),
            isNull(groceryItems.deletedAt),
            gte(
              sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
              start
            ),
            lte(
              sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
              end
            )
          )
        )
        .groupBy(sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`),
      // Month total expenses
      db
        .select({
          total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            scopeToHousehold(transactions.householdId, session.householdId),
            eq(transactions.type, "expense"),
            isNull(transactions.deletedAt),
            gte(transactions.date, start),
            lte(transactions.date, end)
          )
        ),
      // Month total income
      db
        .select({
          total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            scopeToHousehold(transactions.householdId, session.householdId),
            eq(transactions.type, "income"),
            isNull(transactions.deletedAt),
            gte(transactions.date, start),
            lte(transactions.date, end)
          )
        ),
      // Grocery purchases count for the month
      db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(groceryItems)
        .where(
          and(
            scopeToHousehold(groceryItems.householdId, session.householdId),
            eq(groceryItems.isPurchased, true),
            isNotNull(groceryItems.purchasedAt),
            isNull(groceryItems.deletedAt),
            gte(
              sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
              start
            ),
            lte(
              sql`DATE(${groceryItems.purchasedAt} / 1000, 'unixepoch')`,
              end
            )
          )
        ),
      // Household
      db.query.households.findFirst({
        where: eq(
          (await import("@amigo/db")).households.id,
          session.householdId
        ),
      }),
    ]);

  for (const t of txns) {
    events.push({
      id: t.id,
      date: t.date,
      type: "transaction",
      title: t.description || t.category,
      color: t.type === "income" ? "green" : "red",
      metadata: {
        amount: t.amount,
        transactionType: t.type as "income" | "expense",
      },
    });
  }

  for (const g of groceries) {
    events.push({
      id: `grocery-${g.date}`,
      date: g.date,
      type: "grocery_purchase",
      title: `${g.count} item${g.count !== 1 ? "s" : ""} purchased`,
      color: "orange",
      metadata: {
        itemCount: g.count,
      },
    });
  }

  const currentMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const currency = (household?.homeCurrency as CurrencyCode) ?? "CAD";
  const monthName = new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    events,
    currentMonth,
    currency,
    monthName,
    expensesCents: monthExpenses[0]?.total ?? 0,
    incomeCents: monthIncome[0]?.total ?? 0,
    transactionCount: txns.length,
    groceryPurchases: groceryPurchaseCount[0]?.count ?? 0,
  };
}

export default function Calendar() {
  const {
    events,
    currentMonth,
    currency,
    expensesCents,
    incomeCents,
    transactionCount,
    groceryPurchases,
  } = useLoaderData<typeof loader>();

  const cur = currency as CurrencyCode;

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 relative z-10">
      <div className="mb-6 animate-fade-in">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Calendar
        </h1>
        <p className="mt-1 text-muted-foreground">
          Transactions and purchases over time
        </p>
      </div>

      {/* Month summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-stagger-in">
        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/8 to-orange-500/8 dark:from-red-500/15 dark:to-orange-500/15 pointer-events-none" />
          <CardContent className="relative p-3 md:p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/80 text-red-500 dark:text-red-400 shrink-0">
              <ArrowDownRight className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Expenses
              </p>
              <p className="font-display text-lg font-bold tracking-tight truncate">
                {formatCents(expensesCents, cur)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-teal-500/8 dark:from-emerald-500/15 dark:to-teal-500/15 pointer-events-none" />
          <CardContent className="relative p-3 md:p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/80 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ArrowUpRight className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Income
              </p>
              <p className="font-display text-lg font-bold tracking-tight truncate">
                {formatCents(incomeCents, cur)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/8 to-indigo-500/8 dark:from-blue-500/15 dark:to-indigo-500/15 pointer-events-none" />
          <CardContent className="relative p-3 md:p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/80 text-blue-600 dark:text-blue-400 shrink-0">
              <Receipt className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Transactions
              </p>
              <p className="font-display text-lg font-bold tracking-tight">
                {transactionCount}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 to-yellow-500/8 dark:from-amber-500/15 dark:to-yellow-500/15 pointer-events-none" />
          <CardContent className="relative p-3 md:p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/80 text-amber-600 dark:text-amber-400 shrink-0">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Groceries
              </p>
              <p className="font-display text-lg font-bold tracking-tight">
                {groceryPurchases} bought
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar grid */}
      <div className="animate-fade-in">
        <CalendarView initialEvents={events} initialMonth={currentMonth} />
      </div>
    </main>
  );
}
