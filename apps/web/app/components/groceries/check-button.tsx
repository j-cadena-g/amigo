import { Check } from "lucide-react";
import { cn } from "@/app/lib/utils";

interface CheckButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
}

/** The square ink checkbox that starts every grocery row. */
export function CheckButton({ checked, className, ...props }: CheckButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 border-foreground before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked && "bg-foreground text-background",
        className
      )}
      {...props}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}
