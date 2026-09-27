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
import { useT } from "@/app/i18n";

interface DatePickerModalProps {
  item: GroceryItemWithTags;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

export function DatePickerModal({ item, onConfirm, onCancel }: DatePickerModalProps) {
  const t = useT();
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
            {item.isPurchased ? t.groceries.editPurchaseDate : t.groceries.markAsBought}
          </DialogTitle>
          <DialogDescription>{item.itemName}</DialogDescription>
        </DialogHeader>

        <div>
          <label
            htmlFor="purchase-date"
            className="block text-sm font-semibold text-foreground"
          >
            {t.groceries.boughtOn}
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
            {t.common.cancel}
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {item.isPurchased ? t.groceries.saveDate : t.groceries.markAsBought}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
