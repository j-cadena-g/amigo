import { describe, expect, it } from "vitest";
import viteConfig from "./vite.config";

describe("vite dev config", () => {
  it("excludes Workers SSR dependencies that break Vite pre-bundling", async () => {
    const config =
      typeof viteConfig === "function"
        ? await viteConfig({ command: "serve", mode: "development" })
        : viteConfig;

    expect(config.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining([
        "@clerk/react-router",
        "@clerk/react-router/server",
        "drizzle-orm",
      ])
    );
    expect(config.environments?.amigo?.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining([
        "@clerk/react-router",
        "@clerk/react-router/server",
        "drizzle-orm",
      ])
    );
  });
});
