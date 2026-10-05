import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs in a separate local Worker. All outbound requests terminate here;
// the real sender still encrypts, signs, and sends through node:https.
const pushService = `
const deliveries = [];
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== "local-push.test") return new Response("Unexpected outbound request", { status: 500 });
    if (request.method === "GET" && url.pathname === "/_captures") {
      return Response.json(deliveries);
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/push/")) {
      return new Response("Unknown fake push endpoint", { status: 404 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    deliveries.push({
      path: url.pathname,
      headers: Object.fromEntries(request.headers),
      body: Array.from(bytes),
    });
    return new Response(null, { status: 201 });
  }
};
`;

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "../../packages/db/migrations")
          ),
        },
        outboundService: "local-push-service",
        workers: [
          {
            name: "local-push-service",
            compatibilityDate: "2026-03-01",
            modules: true,
            script: pushService,
          },
        ],
      },
    })),
  ],
  test: {
    include: ["server/lib/notification-transport.integration.test.ts"],
    setupFiles: ["./server/test/apply-migrations.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "@amigo/db": path.resolve(import.meta.dirname, "../../packages/db/src/index.ts"),
    },
  },
});
