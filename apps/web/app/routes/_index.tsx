import { useEffect, useRef } from "react";
import { SignIn, useUser } from "@clerk/react-router";
import { redirect, useRevalidator, type LoaderFunctionArgs } from "react-router";
import { Button } from "@/app/components/ui/button";
import { Wordmark } from "@/app/components/wordmark";
import {
  POST_SIGN_IN_CONTINUE_PATH,
  SIGN_IN_REDIRECT_PROPS,
} from "@/app/lib/post-sign-in";
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
      <p className="text-muted-foreground">Loading…</p>
    </main>
  );
}

export function meta() {
  return [{ title: "amigo" }];
}

function SignedInContinue() {
  const revalidator = useRevalidator();
  const didRevalidate = useRef(false);

  useEffect(() => {
    if (didRevalidate.current) {
      return;
    }
    didRevalidate.current = true;
    void revalidator.revalidate();
  }, [revalidator]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">You&apos;re signed in</h1>
        <p className="mt-2 text-muted-foreground">Taking you to your household…</p>
        <Button asChild className="mt-6 w-full">
          <a href={POST_SIGN_IN_CONTINUE_PATH}>Continue</a>
        </Button>
      </div>
    </main>
  );
}

export default function Index() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return <FullPageLoading />;
  }

  if (isSignedIn) {
    return <SignedInContinue />;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
        <div>
          <h1>
            <Wordmark className="px-3 pb-1 pt-2 text-title-sm md:text-title" />
          </h1>
          <p className="mt-4 text-lg">
            Shared budgets, bills, and grocery lists for your household.
          </p>
        </div>

        <SignIn routing="hash" {...SIGN_IN_REDIRECT_PROPS} />
      </div>
    </main>
  );
}
