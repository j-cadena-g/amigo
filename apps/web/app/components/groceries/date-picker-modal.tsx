import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import type { GroceryItemWithTags } from "./types";
import { toDateInputValue } from "./constants";

interface DatePickerModalProps {
  item: GroceryItemWithTags;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

export function DatePickerModal({ item, onConfirm, onCancel }: DatePickerModalProps) {
  const todayStr = toDateInputValue(new Date());

  const initialDate = item.purchasedAt
    ? toDateInputValue(new Date(item.purchasedAt))
    : todayStr;

  const [selectedDate, setSelectedDate] = useState(initialDate);

  function handleConfirm() {
    const date = new Date(selectedDate + "T12:00:00");
    onConfirm(date);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {item.isPurchased ? "Edit Purchase Date" : "Mark as Purchased"}
          </DialogTitle>
          <DialogDescription>{item.itemName}</DialogDescription>
        </DialogHeader>

        <div>
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

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
