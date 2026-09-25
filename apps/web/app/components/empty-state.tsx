import { cn } from "@/app/lib/utils";

interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("py-6", className)}>
      <p className="max-w-prose text-muted-foreground">{message}</p>
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
