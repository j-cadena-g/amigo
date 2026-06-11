import { useState } from "react";
import { useRevalidator } from "react-router";
import { Button } from "@/app/components/ui/button";
import { useToast } from "@/app/components/toast-provider";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

interface TimezoneSelectProps {
  timezone: string;
  canEdit: boolean;
}

export function TimezoneSelect({ timezone, canEdit }: TimezoneSelectProps) {
  const revalidator = useRevalidator();
  const toast = useToast();
  const [value, setValue] = useState(timezone);
  const [saving, setSaving] = useState(false);

  const options = COMMON_TIMEZONES.includes(value)
    ? COMMON_TIMEZONES
    : [value, ...COMMON_TIMEZONES];

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to update timezone");
      }
      toast("Timezone updated");
      revalidator.revalidate();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update timezone", {
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Budget periods and transaction dates use your household&apos;s local calendar day.
      </p>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!canEdit || saving}
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      {canEdit && (
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving || value === timezone}
        >
          {saving ? "Saving…" : "Save timezone"}
        </Button>
      )}
    </div>
  );
}
