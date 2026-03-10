import { SignOutButton } from "@clerk/react-router";

export default function NoAccess() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto p-6">
        <h1 className="text-2xl font-bold tracking-tight">No Access</h1>
        <p className="text-muted-foreground mt-2">
          You need to be invited to a household to use amigo.
          Ask a household owner to invite you through their Clerk organization.
        </p>
        <SignOutButton>
          <button className="mt-6 px-4 py-2 rounded-md border text-sm hover:bg-muted">
            Sign Out
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
