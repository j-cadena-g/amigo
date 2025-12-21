import { getSession } from "@/lib/session";
import { NavBar } from "./nav-bar";

interface AppShellProps {
  children: React.ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const session = await getSession();

  // If authenticated, show navigation
  if (session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar userName={session.name} userEmail={session.email} />
        {children}
      </div>
    );
  }

  // If not authenticated, just render children (login page, etc.)
  return <>{children}</>;
}
