import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-500">Manage your account and preferences</p>
      </div>

      <div className="rounded-lg border bg-white p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Settings className="mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">Coming Soon</h3>
          <p className="mt-1 text-sm text-gray-500">
            Settings and preferences will be available in a future update.
          </p>
        </div>
      </div>
    </main>
  );
}
