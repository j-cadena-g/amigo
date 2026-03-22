import { SignIn, useUser } from "@clerk/react-router";
import { Navigate } from "react-router";

export default function Index() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-soft font-display text-lg text-muted-foreground">
          Loading...
        </div>
      </main>
    );
  }

  if (isSignedIn) {
    return <Navigate to="/dashboard" />;
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
