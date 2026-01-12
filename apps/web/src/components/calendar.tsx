"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { ChevronLeft, ChevronRight, Repeat, ShoppingCart, ArrowDownCircle, X } from "lucide-react";
import { getCalendarEvents, type CalendarEvent } from "@/actions/calendar";

interface CalendarProps {
  initialYear: number;
  initialMonth: number;
  initialEvents: CalendarEvent[];
  wsUrl: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// Format a date as YYYY-MM-DD in the user's local timezone (for timestamps)
function toLocalDateKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Format a date as YYYY-MM-DD using UTC components (for date-only fields already normalized server-side)
function toUTCDateKey(date: Date): string {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatAmount(amount: string | undefined, type: "income" | "expense" | undefined): string {
  if (!amount) return "";
  const num = parseFloat(amount);
  const prefix = type === "income" ? "+" : "-";
  return `${prefix}$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function getEventColorClasses(color: CalendarEvent["color"]): { bg: string; text: string; dot: string } {
  switch (color) {
    case "green":
      return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", dot: "bg-green-500" };
    case "red":
      return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" };
    case "orange":
      return { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" };
    case "blue":
      return { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" };
    default:
      return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-500" };
  }
}

function EventIcon({ type, className }: { type: CalendarEvent["type"]; className?: string }) {
  switch (type) {
    case "recurring":
      return <Repeat className={className} />;
    case "grocery_purchase":
      return <ShoppingCart className={className} />;
    case "transaction":
      return <ArrowDownCircle className={className} />;
    default:
      return null;
  }
}

interface DayEventsModalProps {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
}

function DayEventsModal({ date, events, onClose }: DayEventsModalProps) {
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] overflow-auto rounded-lg border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{dateStr}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">No events on this day</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const colors = getEventColorClasses(event.color);
              return (
                <div
                  key={event.id}
                  className={`rounded-lg p-3 ${colors.bg}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1.5 ${colors.text} bg-white dark:bg-gray-800`}>
                      <EventIcon type={event.type} className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`font-medium ${colors.text}`}>{event.title}</p>
                        {event.metadata?.amount && (
                          <span className={`text-sm font-semibold ${colors.text}`}>
                            {formatAmount(event.metadata.amount, event.metadata.transactionType)}
                          </span>
                        )}
                      </div>
                      {event.subtitle && (
                        <p className="text-sm text-muted-foreground truncate">{event.subtitle}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {event.type === "recurring" && (
                          <span className="capitalize">{event.metadata?.frequency?.toLowerCase()}</span>
                        )}
                        {event.type === "grocery_purchase" && (
                          <span>Grocery shopping</span>
                        )}
                        {event.type === "transaction" && (
                          <span className="capitalize">{event.metadata?.transactionType}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function Calendar({ initialYear, initialMonth, initialEvents, wsUrl }: CalendarProps) {
  const [isPending, startTransition] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [fetchedEvents, setFetchedEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Use initial events when viewing initial month, otherwise use fetched events
  const events = useMemo(() => {
    if (year === initialYear && month === initialMonth) {
      return initialEvents;
    }
    return fetchedEvents ?? [];
  }, [year, month, initialYear, initialMonth, initialEvents, fetchedEvents]);

  // Fetch events when month/year changes to a different month
  useEffect(() => {
    // Skip fetching when viewing the initial month - we already have those events
    if (year === initialYear && month === initialMonth) {
      return;
    }

    let cancelled = false;

    startTransition(async () => {
      try {
        const result = await getCalendarEvents(year, month);
        if (!cancelled) {
          setFetchedEvents(result.events);
        }
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [year, month, initialYear, initialMonth]);

  // WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsFullUrl = `${protocol}//${window.location.host}${wsUrl}`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      ws = new WebSocket(wsFullUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.type === "RECURRING_UPDATE" ||
            data.type === "GROCERY_UPDATE" ||
            data.type === "TRANSACTION_UPDATE"
          ) {
            // Refresh events for current month
            getCalendarEvents(year, month)
              .then((result) => setFetchedEvents(result.events))
              .catch(console.error);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      ws?.close();
      clearTimeout(reconnectTimeout);
    };
  }, [wsUrl, year, month]);

  const goToPreviousMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Group events by date
  // - grocery_purchase events have full timestamps, use local timezone for display
  // - transaction/recurring events have date-only fields normalized to UTC by server, use UTC
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    // Grocery purchases are timestamps - convert to user's local date
    // Other events are date-only fields - use UTC to preserve server normalization
    const dateKey = event.type === "grocery_purchase"
      ? toLocalDateKey(new Date(event.date))
      : toUTCDateKey(new Date(event.date));
    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, []);
    }
    eventsByDate.get(dateKey)!.push(event);
  }

  // Consolidate grocery purchases into a single event per day for display
  for (const [dateKey, dayEvents] of eventsByDate) {
    const groceryEvents = dayEvents.filter(e => e.type === "grocery_purchase");
    const otherEvents = dayEvents.filter(e => e.type !== "grocery_purchase");

    if (groceryEvents.length > 1) {
      // Replace multiple grocery events with a single consolidated one
      const consolidatedGrocery: CalendarEvent = {
        id: `grocery-consolidated-${dateKey}`,
        type: "grocery_purchase",
        date: groceryEvents[0]!.date,
        title: `${groceryEvents.length} items purchased`,
        color: "orange",
        metadata: {
          itemCount: groceryEvents.length,
        },
      };
      eventsByDate.set(dateKey, [...otherEvents, consolidatedGrocery]);
    } else if (groceryEvents.length === 1) {
      // Single item - update title to show "1 item purchased"
      const single = groceryEvents[0]!;
      const updatedGrocery: CalendarEvent = {
        ...single,
        title: "1 item purchased",
      };
      eventsByDate.set(dateKey, [...otherEvents, updatedGrocery]);
    }
  }

  // Calculate days from previous month to show
  const prevMonthDays = firstDayOfMonth;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevMonthYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth);

  // Calculate days from next month to show
  const totalCells = Math.ceil((daysInMonth + firstDayOfMonth) / 7) * 7;
  const nextMonthDays = totalCells - daysInMonth - firstDayOfMonth;

  const selectedDateEvents = selectedDate
    ? eventsByDate.get(toLocalDateKey(selectedDate)) || []
    : [];

  return (
    <div className="space-y-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="rounded-md p-2 hover:bg-accent"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-semibold min-w-[180px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={goToNextMonth}
            className="rounded-md p-2 hover:bg-accent"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={goToToday}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className={`grid grid-cols-7 ${isPending ? "opacity-50" : ""}`}>
          {/* Previous month days */}
          {Array.from({ length: prevMonthDays }).map((_, i) => {
            const day = daysInPrevMonth - prevMonthDays + i + 1;
            return (
              <div
                key={`prev-${i}`}
                className="min-h-[100px] border-b border-r p-1 bg-muted/20"
              >
                <span className="text-sm text-muted-foreground/50">{day}</span>
              </div>
            );
          })}

          {/* Current month days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayEvents = eventsByDate.get(dateKey) || [];
            const isToday = isCurrentMonth && today.getDate() === day;

            return (
              <div
                key={`day-${day}`}
                onClick={() => setSelectedDate(new Date(year, month, day))}
                className={`min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-accent/50 transition-colors ${
                  isToday ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-sm font-medium ${
                      isToday
                        ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        : ""
                    }`}
                  >
                    {day}
                  </span>
                  {dayEvents.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => {
                    const colors = getEventColorClasses(event.color);
                    return (
                      <div
                        key={event.id}
                        className={`rounded px-1 py-0.5 text-xs truncate ${colors.bg} ${colors.text}`}
                        title={`${event.title}${event.metadata?.amount ? ` - ${formatAmount(event.metadata.amount, event.metadata.transactionType)}` : ""}`}
                      >
                        <span className="flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot} flex-shrink-0`} />
                          <span className="truncate">{event.title}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Next month days */}
          {Array.from({ length: nextMonthDays }).map((_, i) => {
            const day = i + 1;
            return (
              <div
                key={`next-${i}`}
                className="min-h-[100px] border-b border-r p-1 bg-muted/20"
              >
                <span className="text-sm text-muted-foreground/50">{day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Income</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Expense (Recurring)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Transaction</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-orange-500" />
          <span className="text-muted-foreground">Grocery Purchase</span>
        </div>
      </div>

      {/* Day events modal */}
      {selectedDate && (
        <DayEventsModal
          date={selectedDate}
          events={selectedDateEvents}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
