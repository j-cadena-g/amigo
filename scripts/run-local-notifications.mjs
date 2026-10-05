#!/usr/bin/env node
// Dispatch only reminder crons through the running local Cloudflare Vite Worker.
import { pathToFileURL } from "node:url";

export async function runLocalNotifications(args, request = fetch) {
  const options = new Set(args);
  if (options.has("--help")) {
    console.log("Usage: pnpm run dev:notifications [--transactions | --recurring | --all]");
    return;
  }
  if (args.some((arg) => !["--transactions", "--recurring", "--all"].includes(arg)) || options.size > 1) {
    throw new Error("Choose --transactions, --recurring, or --all. Use --help for usage.");
  }
  const base = "http://localhost:5190/cdn-cgi/local/explorer/api";
  const json = async (path, init = {}) => {
    let response;
    try {
      response = await request(`${base}${path}`, {
        ...init, redirect: "error", signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error("Cannot reach the local Worker. Start pnpm run dev in another terminal.");
    }
    if (!response.ok) throw new Error(`Local Worker request failed (${response.status}).`);
    const body = await response.json();
    if (!body.success) throw new Error("Local Worker rejected the request. Check the dev server logs.");
    return body.result;
  };
  const workers = await json("/local/workers");
  const worker = workers.find((entry) => entry.isSelf);
  if (!worker) throw new Error("The local app Worker was not found.");
  // Both schedulers share one cron; retain the old flags as aliases.
  for (const cron of ["* * * * *"]) {
    if (!worker.triggers?.crons.includes(cron)) throw new Error("The local Worker does not have this reminder cron configured.");
    const result = await json(`/local/scheduled?${new URLSearchParams({ worker: worker.name })}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cron }),
    });
    if (result.outcome !== "ok") throw new Error(`Reminder handler finished with outcome: ${result.outcome}`);
    console.log("Transaction and recurring reminder handlers: ok");
  }
  console.log("Check the dev server's sent/failed counts. Only selected reminders due within the last three hours are sent.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalNotifications(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
