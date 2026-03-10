import { useState } from "react";
import { useNavigate } from "react-router";
import { useClerk } from "@clerk/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { RotateCcw, Sparkles, LogOut } from "lucide-react";

export default function RestoreAccount() {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleRestore = async () => {
    setIsLoading("restore");
    try {
      const res = await fetch("/api/restore/restore", { method: "POST" });
      if (res.ok) {
        navigate("/dashboard");
      }
    } catch {
      // Error handled silently
    } finally {
      setIsLoading(null);
    }
  };

  const handleFreshStart = async () => {
    setIsLoading("fresh");
    try {
      const res = await fetch("/api/restore/fresh-start", { method: "POST" });
      if (res.ok) {
        navigate("/dashboard");
      }
    } catch {
      // Error handled silently
    } finally {
      setIsLoading(null);
    }
  };

  const handleCancel = async () => {
    setIsLoading("cancel");
    try {
      await fetch("/api/restore/cancel", { method: "POST" });
      signOut();
    } catch {
      setIsLoading(null);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome Back</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Your account was previously deactivated. Choose how you&apos;d like
            to proceed.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-start gap-3"
            variant="default"
            onClick={handleRestore}
            disabled={isLoading !== null}
          >
            <RotateCcw className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Restore My Account</p>
              <p className="text-xs opacity-80">
                Reconnect to your previous household and data
              </p>
            </div>
          </Button>

          <Button
            className="w-full justify-start gap-3"
            variant="outline"
            onClick={handleFreshStart}
            disabled={isLoading !== null}
          >
            <Sparkles className="h-4 w-4" />
            <div className="text-left">
              <p className="font-medium">Start Fresh</p>
              <p className="text-xs text-muted-foreground">
                Create a new household. Your old data transfers to the owner.
              </p>
            </div>
          </Button>

          <Button
            className="w-full justify-start gap-3"
            variant="ghost"
            onClick={handleCancel}
            disabled={isLoading !== null}
          >
            <LogOut className="h-4 w-4" />
            Cancel &amp; Sign Out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
