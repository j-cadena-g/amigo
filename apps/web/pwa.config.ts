import type { VitePWAOptions } from "vite-plugin-pwa";

/** Must match wrangler.jsonc `assets.directory` (without the leading `./`). */
export const PWA_CLIENT_OUT_DIR = "build/client";

export function createAmigoPwaOptions(): Partial<VitePWAOptions> {
  return {
    strategies: "injectManifest",
    srcDir: "app",
    filename: "sw.ts",
    outDir: PWA_CLIENT_OUT_DIR,
    registerType: "autoUpdate",
    injectManifest: {
      globDirectory: PWA_CLIENT_OUT_DIR,
      globPatterns: ["**/*.{js,css,html,png,svg,ico,woff,woff2}"],
    },
    manifest: {
      name: "amigo",
      short_name: "amigo",
      description: "Household management for budgeting and grocery tracking",
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
  };
}
