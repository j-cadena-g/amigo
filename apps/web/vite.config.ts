import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { createAmigoPwaOptions } from "./pwa.config";
import { AMIGO_DEV_PORT } from "./server/lib/dev-origin";

const optimizeDepsExcludes = [
  "@clerk/react-router",
  "@clerk/react-router/server",
  "drizzle-orm",
];
const clientOptimizeDepsIncludes = [
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
];
const workerSsrOptimizeDepsIncludes = [
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
];
const workerSsrOptimizeDepsExcludes = ["@clerk/react-router/server", "drizzle-orm"];

export default defineConfig(({ command }) => {
  const isVitest = process.env.VITEST === "true";

  return {
    // Quick tunnels (cloudflared trycloudflare.com) get a random subdomain each
    // run; the leading dot allows any *.trycloudflare.com hostname in dev.
    server:
      command === "serve" && !isVitest
        ? {
            port: AMIGO_DEV_PORT,
            strictPort: true,
            allowedHosts: [".trycloudflare.com"],
          }
        : undefined,
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      include: clientOptimizeDepsIncludes,
      exclude: optimizeDepsExcludes,
    },
    environments: {
      amigo: {
        optimizeDeps: {
          include: workerSsrOptimizeDepsIncludes,
          exclude: workerSsrOptimizeDepsExcludes,
        },
      },
    },
    build: {
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (warning.message.includes("Can't resolve original location of error")) return;
          defaultHandler(warning);
        },
      },
    },
    plugins: [
      command === "serve" && !isVitest
        ? cloudflare(
            process.env.AMIGO_WRANGLER_CONFIG
              ? { configPath: process.env.AMIGO_WRANGLER_CONFIG }
              : undefined,
          )
        : null,
      tailwindcss(),
      reactRouter(),
      VitePWA(createAmigoPwaOptions()),
    ].filter(Boolean),
  };
});
