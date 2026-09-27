import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { DayDetailDialog } from "@/app/components/day-detail-dialog";
import { LedgerSection } from "@/app/components/ledger";
import { formatCents, formatShortCents } from "@/app/lib/currency";
import {
  formatMonthInSentence,
  formatMonthLabel,
  weekdayHeaders,
  leadingBlankDays,
  scheduledAhead,
  shiftMonth,
} from "@/app/lib/month-calendar";
import {
  buildMonthStrip,
  describeStripDay,
  type CalendarEvent,
} from "@/app/lib/month-strip";
import { cn } from "@/app/lib/utils";
import { useLocale } from "@/app/lib/use-locale";
import { type Messages, useT } from "@/app/i18n";


interface MonthCalendarProps {
  events: CalendarEvent[];
  month: string; // YYYY-MM
  todayStr: string;
  currency: CurrencyCode;
  className?: string;
}

function aheadLine(
  dueCents: number,
  expectedCents: number,
  currency: CurrencyCode,
  locale: string,
  period: string,
  t: Messages["calendar"]
): string {
  const parts = [];
  if (dueCents > 0) parts.push(t.due(formatCents(dueCents, currency, locale)));
  if (expectedCents > 0) parts.push(t.expected(formatCents(expectedCents, currency, locale)));
  if (parts.length === 0) return t.nothingScheduled(period);
  return t.scheduled(parts.join(t.and), period);
}

export function MonthCalendar({
  events: initialEvents,
  month: initialMonth,
  todayStr,
  currency,
  className,
}: MonthCalendarProps) {
  const t = useT();
  const locale = useLocale();
  const [month, setMonth] = useState(initialMonth);
  const [eventsByMonth, setEventsByMonth] = useState<Record<string, CalendarEvent[]>>({
    [initialMonth]: initialEvents,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loaderMonthRef = useRef(initialMonth);

  // Loader revalidation (a new transaction, a realtime update) replaces the
  // dashboard's month and drops other cached months, so the viewed month
  // refetches below and in-flight requests can't restore pre-change data.
  // When the loader rolls over to a new month, follow it unless the viewer moved.
  useEffect(() => {
    setEventsByMonth((prev) =>
      prev[initialMonth] === initialEvents ? prev : { [initialMonth]: initialEvents }
    );
    requestIdRef.current++;
    const previousLoaderMonth = loaderMonthRef.current;
    loaderMonthRef.current = initialMonth;
    if (previousLoaderMonth !== initialMonth) {
      setMonth((current) => (current === previousLoaderMonth ? initialMonth : current));
    }
  }, [initialMonth, initialEvents]);

  const load = useCallback(async (target: string) => {
    const requestId = ++requestIdRef.current;
    setLoadError(null);
    const [year, monthNumber] = target.split("-").map(Number) as [number, number];
    try {
      const res = await fetch(`/api/calendar?year=${year}&month=${monthNumber}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events?: CalendarEvent[] };
      if (requestId !== requestIdRef.current) return;
      setEventsByMonth((prev) => ({ ...prev, [target]: data.events ?? [] }));
    } catch {
      if (requestId !== requestIdRef.current) return;
      setLoadError(
        t.calendar.loadFailed(formatMonthLabel(target, locale))
      );
    }
  }, [locale, t]);

  const events = eventsByMonth[month];

  // Fetch the viewed month whenever it isn't cached: after navigating, or after
  // a revalidation dropped it (also mid-fetch, since that response is now
  // ignored). A failed load waits for "Try again".
  useEffect(() => {
    if (eventsByMonth[month] === undefined && loadError === null) void load(month);
  }, [eventsByMonth, loadError, load, month]);

  const strip = useMemo(
    () =>
      buildMonthStrip({ events: events ?? [], month, todayStr, homeCurrency: currency }),
    [events, month, todayStr, currency]
  );
  const todayMonth = todayStr.slice(0, 7);
  const monthLabel = formatMonthLabel(month, locale);

  function goTo(target: string) {
    // Ignore responses and errors for the month being left.
    requestIdRef.current++;
    setLoadError(null);
    setMonth(target);
  }

  const ahead =
    month >= todayMonth ? scheduledAhead(strip.days, todayStr) : null;
  const period =
    month === todayMonth
      ? t.calendar.restOfMonth(formatMonthInSentence(month, locale))
      : t.calendar.inMonth(formatMonthInSentence(month, locale, { withYear: true }));

  return (
    <LedgerSection
      title={monthLabel}
      className={className}
      aside={
        <div className="flex items-center gap-1">
          {month !== todayMonth && (
            <Button type="button" variant="outline" size="sm" onClick={() => goTo(todayMonth)}>
              {t.calendar.thisMonth}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goTo(shiftMonth(month, -1))}
          >
            <ChevronLeft />
            <span className="sr-only">{t.calendar.previousMonth}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => goTo(shiftMonth(month, 1))}
          >
            <ChevronRight />
            <span className="sr-only">{t.calendar.nextMonth}</span>
          </Button>
        </div>
      }
    >
      <div className="mt-3 mb-2 flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p aria-live="polite">
          {loadError ? (
            <span className="text-foreground">
              {loadError}{" "}
              <button
                type="button"
                onClick={() => void load(month)}
                className="font-semibold underline underline-offset-4"
              >
                {t.common.tryAgain}
              </button>
            </span>
          ) : events === undefined ? (
            t.common.loading
          ) : null}
        </p>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2 bg-foreground" />
            {t.calendar.legendSpent}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2 border border-foreground" />
            {t.calendar.legendDue}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2 bg-success" />
            {t.calendar.legendReceived}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="grid grid-cols-7 text-xs text-muted-foreground">
        {weekdayHeaders(locale).map((weekday) => (
          <div key={weekday} className="px-0.5 py-1 md:px-1.5">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-border">
        {Array.from({ length: leadingBlankDays(month) }, (_, i) => (
          <div key={`blank-${i}`} className="border-r border-b border-border" />
        ))}
        {strip.days.map((day) => (
          <button
            key={day.date}
            type="button"
            disabled={day.events.length === 0}
            onClick={() => setOpenDate(day.date)}
            aria-label={describeStripDay(day, currency, locale, t.calendar)}
            className={cn(
              "flex min-h-16 min-w-0 flex-col items-start gap-0.5 overflow-hidden border-r border-b border-border p-0.5 text-left md:min-h-24 md:p-1.5",
              "hover:bg-secondary focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent",
              day.date < todayStr && "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "font-mono text-xs",
                day.isToday && "rounded-xs bg-tag px-1 font-semibold text-tag-foreground"
              )}
            >
              {day.day}
            </span>
            <span className="flex max-w-full flex-col items-start gap-0.5 font-mono text-xs font-medium leading-tight">
              {day.spentCents > 0 && (
                <span className="max-w-full truncate text-foreground">
                  {formatShortCents(day.spentCents, currency, locale)}
                </span>
              )}
              {day.scheduledSpentCents > 0 && (
                <span className="max-w-full truncate border border-foreground text-foreground md:px-0.5">
                  {formatShortCents(day.scheduledSpentCents, currency, locale)}
                </span>
              )}
              {day.receivedCents > 0 && (
                <span className="max-w-full truncate text-success">
                  {formatShortCents(day.receivedCents, currency, locale)}
                </span>
              )}
              {day.scheduledReceivedCents > 0 && (
                <span className="max-w-full truncate border border-success text-success md:px-0.5">
                  {formatShortCents(day.scheduledReceivedCents, currency, locale)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {ahead && events !== undefined && (
        <p className="mt-3 text-sm">
          {aheadLine(ahead.dueCents, ahead.expectedCents, currency, locale, period, t.calendar)}
        </p>
      )}

      <DayDetailDialog
        date={openDate}
        events={strip.days.find((d) => d.date === openDate)?.events ?? []}
        onClose={() => setOpenDate(null)}
      />
    </LedgerSection>
  );
}
