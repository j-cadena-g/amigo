import { useClerk, useUser } from "@clerk/react-router";
import { Button } from "@/app/components/ui/button";
import { useT } from "@/app/i18n";

export function AccountSettings() {
  const t = useT();
  const { user } = useUser();
  const { signOut } = useClerk();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="min-w-0">
        {email
          ? t.settings.account.signedInAs(
              <span className="break-all font-semibold">{email}</span>
            )
          : t.settings.account.signedIn}
      </p>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        {t.nav.signOut}
      </Button>
    </div>
  );
}
