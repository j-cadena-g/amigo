import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, useIsMounted } from "@/app/components/theme-provider";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const isMounted = useIsMounted();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  if (!isMounted) {
    return (
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-secondary/80"
        aria-label="Toggle theme"
      >
        <Monitor className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      onClick={cycleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-secondary/80 active:scale-95"
      aria-label={`Current theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
    >
      {theme === "light" && <Sun className="h-4 w-4" />}
      {theme === "dark" && <Moon className="h-4 w-4" />}
      {theme === "system" && <Monitor className="h-4 w-4" />}
    </button>
  );
}
