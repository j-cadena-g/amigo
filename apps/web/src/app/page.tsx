import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Force dynamic rendering - page queries database
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  // If logged in, redirect to the dashboard
  if (session) {
    redirect("/dashboard");
  }

  // If not logged in, show login page
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">amigo</h1>
        <p className="text-muted-foreground mb-8">
          Household budgeting with grocery tracking
        </p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Login with Authentik
        </a>
      </div>
    </main>
  );
}
