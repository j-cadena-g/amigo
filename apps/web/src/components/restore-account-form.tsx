"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@amigo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@amigo/ui/components/card";
import {
  restoreUserAccount,
  freshStartUserAccount,
  cancelRestore,
} from "@/actions/restore";
import { RotateCcw, Sparkles, LogOut } from "lucide-react";

interface RestoreAccountFormProps {
  hasData: boolean;
}

export function RestoreAccountForm({ hasData }: RestoreAccountFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restoreUserAccount();
      if (result.success) {
        router.push("/dashboard");
      } else {
        console.error("Restore failed:", result.error);
        // On error, redirect to login
        router.push("/api/auth/login?error=restore_failed");
      }
    });
  };

  const handleFreshStart = () => {
    startTransition(async () => {
      const result = await freshStartUserAccount();
      if (result.success) {
        router.push("/dashboard");
      } else {
        console.error("Fresh start failed:", result.error);
        router.push("/api/auth/login?error=restore_failed");
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      await cancelRestore();
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-center text-lg font-semibold">
        How would you like to continue?
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-lg ${isPending ? "pointer-events-none opacity-50" : ""}`}
          onClick={handleRestore}
        >
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <RotateCcw className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Restore My Account</CardTitle>
            <CardDescription>
              {hasData
                ? "Reconnect to your previous data and pick up where you left off."
                : "Reactivate your account and rejoin the household."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" disabled={isPending}>
              {isPending ? "Processing..." : "Restore Account"}
            </Button>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-shadow hover:shadow-lg ${isPending ? "pointer-events-none opacity-50" : ""}`}
          onClick={handleFreshStart}
        >
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
              <Sparkles className="h-5 w-5 text-secondary-foreground" />
            </div>
            <CardTitle>Start Fresh</CardTitle>
            <CardDescription>
              {hasData
                ? "Transfer your previous data to the household owner and begin with a clean slate."
                : "Begin with a clean slate as a new member."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" className="w-full" disabled={isPending}>
              {isPending ? "Processing..." : "Start Fresh"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={isPending}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cancel and Sign Out
        </Button>
      </div>
    </div>
  );
}
