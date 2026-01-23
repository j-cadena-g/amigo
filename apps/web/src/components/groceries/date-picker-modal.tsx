"use client";

import type { GroceryItemWithTags } from "./types";

interface DatePickerModalProps {
  item: GroceryItemWithTags;
  selectedDate: string;
  isPending: boolean;
  onDateChange: (date: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function DatePickerModal({
  item,
  selectedDate,
  isPending,
  onDateChange,
  onSubmit,
  onCancel,
}: DatePickerModalProps) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80"
        onClick={onCancel}
      />
      {/* Dialog */}
      <div className="relative z-50 w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg mx-4">
        <div className="flex flex-col space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold">
              {item.isPurchased ? "Edit Purchase Date" : "Mark as Purchased"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {item.itemName}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Purchase Date
            </label>
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => onDateChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!selectedDate || isPending}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
