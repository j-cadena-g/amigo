import { redirect, Outlet, type LoaderFunctionArgs } from "react-router";
import { NavBar } from "@/app/components/layout/nav-bar";
import { OfflineIndicator } from "@/app/components/offline-indicator";
import { ConfirmProvider } from "@/app/components/confirm-provider";
import { ToastProvider } from "@/app/components/toast-provider";
import { PushPromptProvider } from "@/app/components/push-prompt-provider";
import { ThemeProvider } from "@/app/components/theme-provider";
import { requireSession, getSessionStatus } from "@/app/lib/session.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);

  if (status === "unauthenticated") {
    throw redirect("/");
  }

  if (status === "revoked") {
    throw redirect("/restore-account");
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
      <ToastProvider>
        <ConfirmProvider>
          <PushPromptProvider>
            <div className="min-h-screen bg-background relative">
              <NavBar />
              <OfflineIndicator />
              <div className="page-enter relative z-10">
                <Outlet />
              </div>
            </div>
          </PushPromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
