import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
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
            {item.isPurchased ? "Edit purchase date" : "Mark as bought"}
          </DialogTitle>
          <DialogDescription>{item.itemName}</DialogDescription>
        </DialogHeader>

        <div>
          <label
            htmlFor="purchase-date"
            className="block text-sm font-semibold text-foreground"
          >
            Bought on
          </label>
          <input
            id="purchase-date"
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {item.isPurchased ? "Save date" : "Mark as bought"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
