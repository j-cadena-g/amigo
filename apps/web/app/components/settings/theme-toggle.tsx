import { useTheme, useIsMounted } from "@/app/components/theme-provider";
import { useRovingRadioGroup } from "@/app/lib/use-roving-radio-group";
import { cn } from "@/app/lib/utils";
import { type Messages, useT } from "@/app/i18n";

const THEME_VALUES = ["light", "dark", "system"] as const;

const OPTIONS = [
  { value: "light", label: (t: Messages) => t.settings.theme.light },
  { value: "dark", label: (t: Messages) => t.settings.theme.dark },
  { value: "system", label: (t: Messages) => t.settings.theme.system },
] as const;

const SEGMENT_CLASS =
  "relative h-9 min-w-20 rounded-sm px-4 text-sm font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']";

export function SettingsThemeToggle() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const isMounted = useIsMounted();
  const getThemeRadioProps = useRovingRadioGroup(THEME_VALUES, theme, setTheme);

  // The stored theme is only known on the client; render the same shape unselected until then.
  if (!isMounted) {
    return (
      <div className="inline-flex rounded-md border border-input p-0.5" aria-hidden="true">
        {OPTIONS.map(({ value, label }) => (
          <span
            key={value}
            className={cn(SEGMENT_CLASS, "flex items-center justify-center text-muted-foreground")}
          >
            {label(t)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className="inline-flex rounded-md border border-input p-0.5"
      role="radiogroup"
      aria-label={t.settings.theme.label}
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          {...getThemeRadioProps(value)}
          className={cn(
            SEGMENT_CLASS,
            theme === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label(t)}
        </button>
      ))}
    </div>
  );
}
