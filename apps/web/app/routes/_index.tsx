import { SignIn, useUser } from "@clerk/react-router";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { getSessionStatus } from "@/app/lib/session.server";

export function loader({ context }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);

  if (status === "authenticated") {
    throw redirect("/dashboard");
  }

  if (status === "needs_setup") {
    throw redirect("/setup");
  }

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  return null;
}

function FullPageLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse-soft font-display text-lg text-muted-foreground">
        Loading...
      </div>
    </main>
  );
}

export default function Index() {
  const { isSignedIn, isLoaded, user } = useUser();

  if (!isLoaded) {
    return <FullPageLoading />;
  }

  if (isSignedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md mx-auto p-6 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-muted-foreground">
            {user?.primaryEmailAddress?.emailAddress ?? "Your account"} is signed in.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            The local server has not attached this Clerk session to an amigo household yet.
            Continue by setting up a household.
          </p>
          <a
            href="/setup"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Set up household
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-background overflow-hidden">
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full bg-accent/40 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        {/* Brand */}
        <div className="text-center animate-fade-in">
          <img
            src="/icon-1024.png"
            alt="amigo"
            className="mx-auto mb-6 h-16 w-16 rounded-2xl shadow-lg shadow-primary/20"
          />
          <h1 className="font-display text-5xl font-bold tracking-tight md:text-6xl">
            amigo
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Household management, simplified.
          </p>
        </div>

        {/* Clerk sign-in */}
        <div className="animate-slide-in" style={{ animationDelay: "150ms" }}>
          <SignIn routing="hash" />
        </div>
      </div>
    </main>
  );
}
