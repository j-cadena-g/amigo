import { redirect, Outlet, type LoaderFunctionArgs } from "react-router";
import { NavBar } from "@/app/components/layout/nav-bar";
import { ConfirmProvider } from "@/app/components/confirm-provider";
import { ThemeProvider } from "@/app/components/theme-provider";
import { requireSession, getSessionStatus } from "@/app/lib/session.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);

  if (status === "unauthenticated") {
    throw redirect("/");
  }

  if (status === "no_org") {
    throw redirect("/no-access");
  }

  if (status === "needs_setup") {
    throw redirect("/setup");
  }

  const session = requireSession(context);
  return {
    userId: session.userId,
    role: session.role,
    householdId: session.householdId,
  };
}

export default function AppLayout() {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <div className="min-h-screen bg-background relative">
          <NavBar />
          <div className="page-enter relative z-10">
            <Outlet />
          </div>
        </div>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
