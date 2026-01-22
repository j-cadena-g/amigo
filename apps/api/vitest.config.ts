import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      // Coverage thresholds - enforced in CI
      // Baseline thresholds after adding graceful degradation to redis.ts
      // TODO: Increase incrementally as more tests are added
      thresholds: {
        statements: 25,
        branches: 35,
        functions: 25,
        lines: 25,
      },
    },
    // Setup file for mocks
    setupFiles: ["./src/test/setup.ts"],
    // Ensure external deps are properly handled
    deps: {
      interopDefault: true,
    },
    // Inline zod to prevent SSR module resolution issues
    server: {
      deps: {
        inline: ["zod", "@hono/zod-validator"],
      },
    },
  },
});
