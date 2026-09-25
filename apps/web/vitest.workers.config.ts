import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(
        import.meta.dirname,
        "../../packages/db/migrations"
      );
      const migrations = await readD1Migrations(migrationsPath);

      return {
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        // Workers AI is remote-only. Keep the binding, but do not open a
        // remote proxy session from integration tests.
        remoteBindings: false,
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["**/*.integration.test.ts"],
    setupFiles: ["./server/test/apply-migrations.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "@amigo/db": path.resolve(
        import.meta.dirname,
        "../../packages/db/src/index.ts"
      ),
    },
  },
});
