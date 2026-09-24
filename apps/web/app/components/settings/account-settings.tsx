import { useClerk, useUser } from "@clerk/react-router";
import { Button } from "@/app/components/ui/button";

export function AccountSettings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="min-w-0">
        {email ? (
          <>
            Signed in as <span className="break-all font-semibold">{email}</span>
          </>
        ) : (
          "Signed in"
        )}
      </p>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
