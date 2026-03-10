import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, useIsMounted } from "@/app/components/theme-provider";

export function SettingsThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isMounted = useIsMounted();

  if (!isMounted) {
    return (
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-md bg-muted"
          />
        ))}
      </div>
    );
  }

  const options = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <div className="flex gap-2">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
            theme === value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
