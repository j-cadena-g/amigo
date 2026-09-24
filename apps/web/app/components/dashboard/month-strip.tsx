import { useMemo, useState } from "react";
import type { CurrencyCode } from "@amigo/db";
import { Button } from "@/app/components/ui/button";
import { DayDetailDialog } from "@/app/components/day-detail-dialog";
import {
  buildMonthStrip,
  describeStripDay,
  type CalendarEvent,
} from "@/app/lib/month-strip";
import { cn } from "@/app/lib/utils";

const AXIS_DAYS = new Set([1, 8, 15, 22, 29]);

/** Square-root scale so one rent day doesn't flatten the rest of the month. */
function barHeight(cents: number, maxCents: number): string {
  if (cents <= 0 || maxCents <= 0) return "0%";
  return `${Math.max(4, Math.sqrt(cents / maxCents) * 100)}%`;
}

interface MonthStripProps {
  events: CalendarEvent[];
  month: string; // YYYY-MM
  todayStr: string;
  currency: CurrencyCode;
  className?: string;
}

export function MonthStrip({
  events,
  month,
  todayStr,
  currency,
  className,
}: MonthStripProps) {
  const strip = useMemo(
    () => buildMonthStrip({ events, month, todayStr, homeCurrency: currency }),
    [events, month, todayStr, currency]
  );
  const todayIndex = strip.days.findIndex((d) => d.isToday);
  const [selectedIndex, setSelectedIndex] = useState(
    todayIndex >= 0 ? todayIndex : strip.days.length - 1
  );
  const [openDate, setOpenDate] = useState<string | null>(null);

  const selected = strip.days[selectedIndex] ?? strip.days[0]!;
  const selectedLine = describeStripDay(selected, currency);
  const openDay = () => {
    if (selected.events.length > 0) setOpenDate(selected.date);
  };

  return (
    <section aria-label="Money out and in by day" className={className}>
      <div className="mb-2 flex justify-end gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2 bg-foreground" />
          Spent
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2 border border-foreground" />
          Due
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-2 bg-success" />
          Received
        </span>
      </div>

      <div className="relative rounded-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-4 has-[:focus-visible]:ring-offset-background">
        <div aria-hidden="true">
          <div className="flex h-24 border-b border-foreground md:h-28">
            {strip.days.map((day, index) => (
              <div
                key={day.date}
                className={cn(
                  "relative flex flex-1 items-end justify-center",
                  day.isToday && "bg-tag/35 dark:bg-tag/20",
                  index === selectedIndex && !day.isToday && "bg-secondary"
                )}
              >
                {day.scheduledSpentCents > 0 && (
                  <span
                    className="absolute bottom-0 w-[45%] max-w-2.5 border border-foreground"
                    style={{ height: barHeight(day.scheduledSpentCents, strip.maxSpentCents) }}
                  />
                )}
                {day.spentCents > 0 && (
                  <span
                    className="relative w-[45%] max-w-2.5 bg-foreground"
                    style={{ height: barHeight(day.spentCents, strip.maxSpentCents) }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex h-2.5">
            {strip.days.map((day) => (
              <div key={day.date} className="flex flex-1 justify-center">
                {day.receivedCents > 0 ? (
                  <span className="mt-1 h-1.5 w-[45%] max-w-2.5 bg-success" />
                ) : day.scheduledReceivedCents > 0 ? (
                  <span className="mt-1 h-1.5 w-[45%] max-w-2.5 border border-success" />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-1 flex h-5 text-xs text-muted-foreground">
            {strip.days.map((day) => {
              const nearToday =
                todayIndex >= 0 && Math.abs(day.day - 1 - todayIndex) <= 2;
              return (
                <div key={day.date} className="relative flex flex-1 justify-center">
                  {day.isToday ? (
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xs bg-tag px-1 font-semibold text-tag-foreground">
                      Today
                    </span>
                  ) : (
                    AXIS_DAYS.has(day.day) &&
                    !nearToday && <span className="font-mono">{day.day}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <input
          type="range"
          min={1}
          max={strip.days.length}
          step={1}
          value={selected.day}
          onChange={(e) => setSelectedIndex(Number(e.target.value) - 1)}
          onKeyDown={(e) => {
            if (e.key === "Enter") openDay();
          }}
          aria-label="Day of the month"
          aria-valuetext={selectedLine}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        />
      </div>

      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm">{selectedLine}</p>
        {selected.events.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={openDay}>
            Open day
          </Button>
        )}
      </div>

      <DayDetailDialog
        date={openDate}
        events={strip.days.find((d) => d.date === openDate)?.events ?? []}
        onClose={() => setOpenDate(null)}
      />
    </section>
  );
}
