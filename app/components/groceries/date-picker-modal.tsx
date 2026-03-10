import { useState } from "react";
import type { GroceryItemWithTags } from "./types";

interface DatePickerModalProps {
  item: GroceryItemWithTags;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

export function DatePickerModal({ item, onConfirm, onCancel }: DatePickerModalProps) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const initialDate = item.purchasedAt
    ? new Date(item.purchasedAt).toISOString().split("T")[0]
    : todayStr;

  const [selectedDate, setSelectedDate] = useState(initialDate);

  function handleConfirm() {
    const date = new Date(selectedDate + "T12:00:00");
    onConfirm(date);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-lg bg-popover p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-popover-foreground">
          {item.isPurchased ? "Edit Purchase Date" : "Mark as Purchased"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.itemName}
        </p>

        <div className="mt-4">
          <label
            htmlFor="purchase-date"
            className="block text-sm font-medium text-foreground"
          >
            Purchase Date
          </label>
          <input
            id="purchase-date"
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
