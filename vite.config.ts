import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => {
  const isVitest = process.env.VITEST === "true";

  return {
    resolve: {
      tsconfigPaths: true,
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
      command === "serve" && !isVitest ? cloudflare() : null,
      tailwindcss(),
      reactRouter(),
      VitePWA({
        registerType: "autoUpdate",
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
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,woff,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/health$/,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-health-cache",
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 1, maxAgeSeconds: 300 },
              },
            },
            {
              urlPattern: /^\/api\//,
              handler: "NetworkOnly",
            },
            {
              urlPattern: /\.(?:js|css|png|jpg|svg|woff2?)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "static-cache",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
  };
});
