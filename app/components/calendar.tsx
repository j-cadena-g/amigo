import { useState, useCallback } from "react";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/app/components/ui/dialog";
import { formatCents } from "@/app/lib/currency";
import { cn } from "@/app/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CurrencyCode } from "@amigo/db";

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

interface CalendarProps {
  initialEvents: CalendarEvent[];
  initialMonth: string; // YYYY-MM
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_DOT_CLASSES: Record<CalendarEvent["color"], string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  orange: "bg-amber-500",
  blue: "bg-blue-500",
};

const EVENT_BADGE_CLASSES: Record<CalendarEvent["color"], string> = {
  green:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  red: "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  orange:
    "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  blue: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
};

const EVENT_TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  recurring: "Recurring",
  grocery_purchase: "Grocery",
  transaction: "Transaction",
};

function parseMonth(monthStr: string): { year: number; month: number } {
  const [yearStr, monthStr2] = monthStr.split("-");
  return {
    year: parseInt(yearStr!, 10),
    month: parseInt(monthStr2!, 10) - 1,
  };
}

function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function normalizeEventDate(dateStr: string): string {
  if (/^\d{10,}$/.test(dateStr)) {
    const d = new Date(parseInt(dateStr, 10));
    return d.toISOString().split("T")[0]!;
  }
  return dateStr.split("T")[0]!;
}

export function Calendar({ initialEvents, initialMonth }: CalendarProps) {
  const initial = parseMonth(initialMonth);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [eventsCache, setEventsCache] = useState<
    Record<string, CalendarEvent[]>
  >({
    [initialMonth]: initialEvents,
  });
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const currentKey = formatMonthKey(year, month);
  const events = eventsCache[currentKey] ?? [];

  const fetchEvents = useCallback(
    async (y: number, m: number) => {
      const key = formatMonthKey(y, m);
      if (eventsCache[key]) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/calendar?year=${y}&month=${m + 1}`);
        if (res.ok) {
          const data = (await res.json()) as { events?: CalendarEvent[] };
          setEventsCache((prev) => ({ ...prev, [key]: data.events ?? [] }));
        }
      } catch {
        // Silently fail, show empty month
      } finally {
        setLoading(false);
      }
    },
    [eventsCache]
  );

  function navigate(direction: -1 | 1) {
    let newMonth = month + direction;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setYear(newYear);
    setMonth(newMonth);
    fetchEvents(newYear, newMonth);
  }

  function goToToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    fetchEvents(now.getFullYear(), now.getMonth());
  }

  // Group events by normalized date
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const date = normalizeEventDate(event.date);
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    },
    {}
  );

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr });
  }

  const monthLabel = new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedEvents = selectedDay ? eventsByDate[selectedDay] ?? [] : [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{monthLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous month</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(1)}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next month</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="text-center text-sm text-muted-foreground py-2 animate-pulse-soft">
              Loading events...
            </div>
          )}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-semibold text-muted-foreground py-2 uppercase tracking-wider"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-px bg-border/50 rounded-xl overflow-hidden">
            {cells.map((cell, i) => {
              if (cell.day === null) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="bg-card min-h-[5.5rem] md:min-h-[6.5rem] p-1.5"
                  />
                );
              }

              const dayEvents =
                cell.dateStr ? eventsByDate[cell.dateStr] ?? [] : [];
              const isToday = cell.dateStr === todayStr;
              const hasEvents = dayEvents.length > 0;

              // Show up to 2 event previews on desktop, dots on mobile
              const previewEvents = dayEvents.slice(0, 2);
              const moreCount = dayEvents.length - 2;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() =>
                    cell.dateStr && setSelectedDay(cell.dateStr)
                  }
                  className={cn(
                    "bg-card min-h-[5.5rem] md:min-h-[6.5rem] p-1.5 text-left transition-all duration-150",
                    "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:z-10",
                    selectedDay === cell.dateStr && "bg-accent/60",
                    hasEvents && "cursor-pointer"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                      isToday &&
                        "bg-primary text-primary-foreground font-bold shadow-sm"
                    )}
                  >
                    {cell.day}
                  </span>

                  {/* Desktop: event previews */}
                  {hasEvents && (
                    <div className="hidden md:flex flex-col gap-0.5 mt-1">
                      {previewEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className={cn(
                            "text-[10px] font-medium leading-tight px-1 py-0.5 rounded truncate",
                            EVENT_BADGE_CLASSES[ev.color]
                          )}
                        >
                          {ev.metadata?.amount != null
                            ? `${ev.metadata.transactionType === "income" ? "+" : "-"}${formatCents(ev.metadata.amount, (ev.metadata.currency ?? "CAD") as CurrencyCode, { compact: true })}`
                            : ev.title}
                        </div>
                      ))}
                      {moreCount > 0 && (
                        <span className="text-[10px] text-muted-foreground px-1">
                          +{moreCount} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Mobile: color dots */}
                  {hasEvents && (
                    <div className="flex md:hidden gap-0.5 mt-1 flex-wrap">
                      {Array.from(
                        new Set(dayEvents.map((e) => e.color))
                      ).map((color) => (
                        <span
                          key={color}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            EVENT_DOT_CLASSES[color]
                          )}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] leading-none text-muted-foreground ml-0.5">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 justify-center">
            {(
              [
                { color: "red", label: "Expense" },
                { color: "green", label: "Income" },
                { color: "orange", label: "Grocery" },
                { color: "blue", label: "Recurring" },
              ] as const
            ).map(({ color, label }) => (
              <div key={color} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    EVENT_DOT_CLASSES[color]
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Day detail modal */}
      <Dialog
        open={selectedDay !== null && selectedEvents.length > 0}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay &&
                new Date(selectedDay + "T12:00:00").toLocaleDateString(
                  "en-US",
                  {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }
                )}
            </DialogTitle>
            <DialogDescription>
              {selectedEvents.length} event
              {selectedEvents.length !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedEvents.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl p-3 transition-colors",
                  EVENT_BADGE_CLASSES[event.color]
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                    EVENT_DOT_CLASSES[event.color]
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {event.title}
                  </p>
                  {event.subtitle && (
                    <p className="text-xs opacity-75">{event.subtitle}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
                      {EVENT_TYPE_LABELS[event.type]}
                    </span>
                    {event.metadata?.amount != null && (
                      <span className="text-xs font-bold tabular-nums">
                        {event.metadata.transactionType === "income"
                          ? "+"
                          : "-"}
                        {formatCents(
                          event.metadata.amount,
                          (event.metadata.currency ?? "CAD") as CurrencyCode
                        )}
                      </span>
                    )}
                    {event.metadata?.frequency && (
                      <span className="text-xs capitalize opacity-75">
                        {event.metadata.frequency.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
