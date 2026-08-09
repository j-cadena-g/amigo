import {
  redirect,
  Outlet,
  useLoaderData,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router";
import { NavBar } from "@/app/components/layout/nav-bar";
import { OfflineIndicator } from "@/app/components/offline-indicator";
import { ConfirmProvider } from "@/app/components/confirm-provider";
import { ToastProvider } from "@/app/components/toast-provider";
import { PushPromptProvider } from "@/app/components/push-prompt-provider";
import { ThemeProvider } from "@/app/components/theme-provider";
import {
  HouseholdRealtimeProvider,
  useHouseholdRealtime,
} from "@/app/components/realtime/household-realtime-provider";
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

/**
 * Default shell subscriber: revalidate on household events.
 * GROCERY_UPDATE is owned by the groceries page (pending-aware); skipping it
 * here preserves optimistic overlays during in-flight grocery mutations.
 */
function HouseholdRealtimeDefaults() {
  const revalidator = useRevalidator();
  useHouseholdRealtime((data) => {
    if (
      data &&
      typeof data === "object" &&
      "type" in data &&
      (data as { type: string }).type === "GROCERY_UPDATE"
    ) {
      return;
    }
    revalidator.revalidate();
  });
  return null;
}

export default function AppLayout() {
  const { userId } = useLoaderData<typeof loader>();

  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PushPromptProvider>
            <HouseholdRealtimeProvider userId={userId}>
              <HouseholdRealtimeDefaults />
              <div className="relative min-h-screen overflow-x-hidden bg-background">
                <NavBar />
                <OfflineIndicator />
                <div className="page-enter relative z-10">
                  <Outlet />
                </div>
              </div>
            </HouseholdRealtimeProvider>
          </PushPromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
