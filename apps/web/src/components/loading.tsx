import Image from "next/image";

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Image
        src="/amigo-PWA-192x192.png"
        alt="amigo"
        width={48}
        height={48}
        className="animate-pulse"
      />
    </div>
  );
}
