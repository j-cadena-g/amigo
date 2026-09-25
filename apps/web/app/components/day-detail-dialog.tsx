import type { CurrencyCode } from "@amigo/db";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  formatDayTotal,
  transactionTotalsForDay,
} from "@/app/lib/calendar-day-totals";
import { formatSignedCents } from "@/app/lib/currency";
import type { CalendarEvent } from "@/app/lib/month-strip";
import { cn } from "@/app/lib/utils";

const ENTRY_KIND_LABELS: Record<CalendarEvent["type"], string | null> = {
  transaction: null,
  recurring: "Scheduled",
  grocery_purchase: "Groceries",
};

export function DayEntries({ events }: { events: CalendarEvent[] }) {
  const totals = transactionTotalsForDay(events);

  return (
    <div className="space-y-3">
      {totals.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {totals.map((total) => (
            <span key={total.currency}>
              <span className="text-muted-foreground">Net </span>
              <span
                className={cn(
                  "font-mono font-medium",
                  total.netCents > 0 && "text-success"
                )}
              >
                {formatDayTotal(total.netCents, total.currency)}
              </span>
            </span>
          ))}
        </p>
      )}

      <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto border-y border-border">
        {events.map((event) => {
          const amount = event.metadata?.amount;
          const isIncome = event.metadata?.transactionType === "income";
          const meta = [
            event.subtitle,
            ENTRY_KIND_LABELS[event.type],
            event.metadata?.frequency?.toLowerCase(),
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              key={event.id}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{event.title}</p>
                {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
              </div>
              {amount != null && (
                <span
                  className={cn(
                    "shrink-0 font-mono font-medium",
                    isIncome && "text-success"
                  )}
                >
                  {formatSignedCents(
                    isIncome ? amount : -amount,
                    (event.metadata?.currency ?? "CAD") as CurrencyCode,
                    { showPlus: true }
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface DayDetailDialogProps {
  /** ISO date of the open day, or null when closed. */
  date: string | null;
  events: CalendarEvent[];
  onClose: () => void;
}

export function DayDetailDialog({ date, events, onClose }: DayDetailDialogProps) {
  return (
    <Dialog
      open={date !== null && events.length > 0}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {date &&
              new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
          </DialogTitle>
          <DialogDescription>
            {events.length === 1 ? "1 entry" : `${events.length} entries`}
          </DialogDescription>
        </DialogHeader>
        <DayEntries events={events} />
      </DialogContent>
    </Dialog>
  );
}
