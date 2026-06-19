import { describe, expect, it } from "vitest";
import viteConfig from "./vite.config";

describe("vite dev config", () => {
  it("excludes only worker-unsafe SSR dependencies from the Workers environment", async () => {
    const config =
      typeof viteConfig === "function"
        ? await viteConfig({ command: "serve", mode: "development" })
        : viteConfig;

    expect(config.optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "class-variance-authority",
        "clsx",
        "dexie",
        "lucide-react",
        "recharts",
        "tailwind-merge",
        "workbox-precaching",
        "workbox-window",
      ])
    );
    expect(config.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining([
        "@clerk/react-router",
        "@clerk/react-router/server",
        "drizzle-orm",
      ])
    );
    expect(config.environments?.amigo?.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining(["@clerk/react-router/server", "drizzle-orm"])
    );
    expect(config.environments?.amigo?.optimizeDeps?.exclude).not.toContain(
      "@clerk/react-router"
    );
    expect(config.environments?.amigo?.optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        "@clerk/react-router",
        "@clerk/react-router > cookie",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "class-variance-authority",
        "clsx",
        "dexie",
        "isbot",
        "lucide-react",
        "react",
        "react-dom/server",
        "react/jsx-dev-runtime",
        "recharts",
        "tailwind-merge",
      ])
    );
  });
});
