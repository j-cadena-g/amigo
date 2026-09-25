import type { Plugin } from "vite";
import { describe, expect, it, vi } from "vitest";
import { AMIGO_DEV_PORT } from "./server/lib/dev-origin";
import viteConfig from "./vite.config";

type TestMiddleware = (
  req: unknown,
  res: { statusCode: number; end: () => void },
  next: () => void
) => void;

describe("vite dev config", () => {
  it("uses the dedicated amigo dev port with strictPort enabled", async () => {
    const previousVitest = process.env.VITEST;
    delete process.env.VITEST;

    try {
      const config =
        typeof viteConfig === "function"
          ? await viteConfig({ command: "serve", mode: "development" })
          : viteConfig;

      expect(config.server).toMatchObject({
        port: AMIGO_DEV_PORT,
        strictPort: true,
      });
    } finally {
      if (previousVitest !== undefined) {
        process.env.VITEST = previousVitest;
      }
    }
  });

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
        "tailwind-merge",
      ])
    );
  });

  it("404s the agent sign-in route unless the browser connects directly from this machine", async () => {
    const config =
      typeof viteConfig === "function"
        ? await viteConfig({ command: "serve", mode: "development" })
        : viteConfig;
    const plugin = ((config.plugins ?? []) as unknown[]).flat(Infinity).find(
      (entry) => (entry as Plugin | null)?.name === "amigo:agent-signin-local-only"
    ) as Plugin | undefined;
    expect(plugin).toBeDefined();

    let middleware: TestMiddleware | undefined;
    (plugin!.configureServer as (server: unknown) => void)({
      middlewares: {
        use: (handler: TestMiddleware) => {
          middleware = handler;
        },
      },
    });

    const run = (url: string, remoteAddress: string, headers: Record<string, string> = {}) => {
      const res = { statusCode: 200, end: vi.fn() };
      const next = vi.fn();
      middleware!({ url, socket: { remoteAddress }, headers }, res, next);
      return { status: res.statusCode, passedOn: next.mock.calls.length === 1 };
    };

    expect(run("/dev/agent-signin", "::1")).toEqual({ status: 200, passedOn: true });
    expect(run("/dev/agent-signin", "192.168.1.20")).toEqual({ status: 404, passedOn: false });
    expect(
      run("/dev/agent-signin", "::1", { "sec-fetch-site": "cross-site" })
    ).toEqual({ status: 404, passedOn: false });
    expect(
      run("/DEV/Agent-Signin/", "127.0.0.1", { "cf-connecting-ip": "203.0.113.9" })
    ).toEqual({ status: 404, passedOn: false });
    expect(run("/dashboard", "192.168.1.20")).toEqual({ status: 200, passedOn: true });
  });
});
