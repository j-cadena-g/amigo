import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.ts"],
    exclude: ["**/*.integration.test.ts", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "@amigo/db": path.resolve(import.meta.dirname, "packages/db/src/index.ts"),
    },
  },
});
