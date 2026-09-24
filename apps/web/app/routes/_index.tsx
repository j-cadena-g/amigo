import { useEffect, useRef } from "react";
import { SignIn, useUser } from "@clerk/react-router";
import { redirect, useRevalidator, type LoaderFunctionArgs } from "react-router";
import { Button } from "@/app/components/ui/button";
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
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-6 text-center">
        <h1 className="type-display text-title-sm">Welcome back</h1>
        <p className="mt-2 text-muted-foreground">
          Taking you to your household…
        </p>
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
    <main className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 px-4">
        <div className="text-center">
          <h1 className="type-display text-hero-sm md:text-hero">amigo</h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Household management, simplified.
          </p>
        </div>

        <SignIn routing="hash" {...SIGN_IN_REDIRECT_PROPS} />
      </div>
    </main>
  );
}
