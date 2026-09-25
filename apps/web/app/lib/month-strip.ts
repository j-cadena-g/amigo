import type { CurrencyCode } from "@amigo/db";
import { formatCents } from "@/app/lib/currency";
import {
  transactionTotalsForDay,
  type TransactionTotalEvent,
} from "@/app/lib/calendar-day-totals";

export interface CalendarEvent {
  id: string;
  type: "recurring" | "grocery_purchase" | "transaction";
  date: string; // ISO YYYY-MM-DD or timestamp ms string
  title: string;
  subtitle?: string;
  color: "green" | "red" | "orange" | "blue";
  metadata?: {
    amount?: number; // cents
    currency?: string;
    transactionType?: "income" | "expense";
    frequency?: string;
    itemCount?: number;
  };
}

export interface MonthStripDay {
  date: string;
  day: number;
  spentCents: number;
  receivedCents: number;
  scheduledSpentCents: number;
  scheduledReceivedCents: number;
  events: CalendarEvent[];
  isToday: boolean;
  isFuture: boolean;
}

export interface MonthStrip {
  days: MonthStripDay[];
  /** Largest posted or scheduled spending on any day; the bars scale to it. */
  maxSpentCents: number;
}

export function normalizeEventDate(dateStr: string): string {
  if (/^\d{10,}$/.test(dateStr)) {
    return new Date(parseInt(dateStr, 10)).toISOString().split("T")[0]!;
  }
  return dateStr.split("T")[0]!;
}

export function groupEventsByDate(
  events: CalendarEvent[]
): Map<string, CalendarEvent[]> {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const date = normalizeEventDate(event.date);
    const existing = byDate.get(date);
    if (existing) existing.push(event);
    else byDate.set(date, [event]);
  }
  return byDate;
}

function homeTotal(
  events: TransactionTotalEvent[],
  homeCurrency: CurrencyCode
): number {
  const total = transactionTotalsForDay(events).find(
    (t) => t.currency === homeCurrency
  );
  return Math.abs(total?.netCents ?? 0);
}

function byKind(
  events: CalendarEvent[],
  type: CalendarEvent["type"],
  transactionType: "income" | "expense"
): CalendarEvent[] {
  return events.filter(
    (e) => e.type === type && e.metadata?.transactionType === transactionType
  );
}

export function buildMonthStrip({
  events,
  month,
  todayStr,
  homeCurrency,
}: {
  events: CalendarEvent[];
  month: string; // YYYY-MM
  todayStr: string;
  homeCurrency: CurrencyCode;
}): MonthStrip {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const byDate = groupEventsByDate(events);
  const days: MonthStripDay[] = [];
  let maxSpentCents = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const dayEvents = byDate.get(date) ?? [];
    const entry: MonthStripDay = {
      date,
      day,
      spentCents: homeTotal(byKind(dayEvents, "transaction", "expense"), homeCurrency),
      receivedCents: homeTotal(byKind(dayEvents, "transaction", "income"), homeCurrency),
      scheduledSpentCents: homeTotal(byKind(dayEvents, "recurring", "expense"), homeCurrency),
      scheduledReceivedCents: homeTotal(byKind(dayEvents, "recurring", "income"), homeCurrency),
      events: dayEvents,
      isToday: date === todayStr,
      isFuture: date > todayStr,
    };
    maxSpentCents = Math.max(
      maxSpentCents,
      entry.spentCents,
      entry.scheduledSpentCents
    );
    days.push(entry);
  }

  return { days, maxSpentCents };
}

export function formatStripDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** One line for the selected day, also used as the scrubber's spoken value. */
export function describeStripDay(
  day: MonthStripDay,
  currency: CurrencyCode
): string {
  const parts = [formatStripDate(day.date)];
  if (day.spentCents > 0) parts.push(`spent ${formatCents(day.spentCents, currency)}`);
  if (day.receivedCents > 0) {
    parts.push(`received ${formatCents(day.receivedCents, currency)}`);
  }
  if (day.scheduledSpentCents > 0) {
    parts.push(`${formatCents(day.scheduledSpentCents, currency)} due`);
  }
  if (day.scheduledReceivedCents > 0) {
    parts.push(`${formatCents(day.scheduledReceivedCents, currency)} expected`);
  }
  const count = day.events.length;
  parts.push(
    count === 0 ? "nothing recorded" : `${count} ${count === 1 ? "entry" : "entries"}`
  );
  return parts.join(" · ");
}
