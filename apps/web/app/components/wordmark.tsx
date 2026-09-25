import { cn } from "@/app/lib/utils";

/** The yellow "amigo" label — the brand mark, in place of the app icon. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "type-display inline-block rounded-sm bg-tag px-2 pb-0.5 pt-1 text-xl leading-none text-tag-foreground",
        className
      )}
    >
      amigo
    </span>
  );
}
