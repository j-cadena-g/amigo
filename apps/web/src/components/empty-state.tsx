import Image from "next/image";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Image
        src="/amigo-PWA-192x192.png"
        alt="amigo"
        width={64}
        height={64}
        className="mb-4 opacity-50"
      />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
