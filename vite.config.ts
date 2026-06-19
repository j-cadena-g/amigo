import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const optimizeDepsExcludes = [
  "@clerk/react-router",
  "@clerk/react-router/server",
  "drizzle-orm",
];
const workerSsrOptimizeDepsExcludes = ["@clerk/react-router/server", "drizzle-orm"];

export default defineConfig(({ command }) => {
  const isVitest = process.env.VITEST === "true";

  return {
    // Quick tunnels (cloudflared trycloudflare.com) get a random subdomain each
    // run; the leading dot allows any *.trycloudflare.com hostname in dev.
    server:
      command === "serve" && !isVitest
        ? { allowedHosts: [".trycloudflare.com"] }
        : undefined,
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      exclude: optimizeDepsExcludes,
    },
    environments: {
      amigo: {
        optimizeDeps: {
          include: ["@clerk/react-router > cookie"],
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
      VitePWA({
        strategies: "injectManifest",
        srcDir: "app",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,woff,woff2}"],
        },
        manifest: {
          name: "amigo",
          short_name: "amigo",
          description:
            "Household management for budgeting and grocery tracking",
          start_url: "/",
          display: "standalone",
          background_color: "#f4f6f9",
          theme_color: "#3B7BD5",
          icons: [
            {
              src: "/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/icon-1024.png",
              sizes: "1024x1024",
              type: "image/png",
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: "module",
        },
      }),
    ].filter(Boolean),
  };
});
