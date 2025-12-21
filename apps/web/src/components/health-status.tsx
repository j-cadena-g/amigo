"use client";

import { useEffect, useState } from "react";
import { client } from "@/lib/api";

interface ServiceStatus {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}

interface HealthData {
  status: "ok" | "error";
  timestamp: string;
  services: {
    postgres: ServiceStatus;
    valkey: ServiceStatus;
  };
}

export function HealthStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const response = await client.api.health.$get();
        const data = (await response.json()) as HealthData;
        setHealth(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch health");
        setHealth(null);
      } finally {
        setLoading(false);
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-muted-foreground">Checking API health...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500 bg-red-50 p-4 dark:bg-red-950">
        <p className="font-medium text-red-700 dark:text-red-300">
          API Unreachable
        </p>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!health) return null;

  const isHealthy = health.status === "ok";

  return (
    <div
      className={`rounded-lg border p-4 ${
        isHealthy
          ? "border-green-500 bg-green-50 dark:bg-green-950"
          : "border-red-500 bg-red-50 dark:bg-red-950"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`h-3 w-3 rounded-full ${
            isHealthy ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <p className="font-medium">
          API Status: {isHealthy ? "Healthy" : "Unhealthy"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-medium">PostgreSQL</p>
          <p
            className={
              health.services.postgres.status === "ok"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {health.services.postgres.status === "ok"
              ? `OK (${health.services.postgres.latencyMs}ms)`
              : health.services.postgres.error}
          </p>
        </div>
        <div>
          <p className="font-medium">Valkey</p>
          <p
            className={
              health.services.valkey.status === "ok"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {health.services.valkey.status === "ok"
              ? `OK (${health.services.valkey.latencyMs}ms)`
              : health.services.valkey.error}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Last checked: {new Date(health.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
