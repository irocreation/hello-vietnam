import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const base = env.VITE_BASE_PATH || "/";
  return {
    base,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/@supabase")) return "supabase";
            if (
              id.includes("node_modules/react") ||
              id.includes("node_modules/scheduler")
            )
              return "react";
            if (id.includes("node_modules/dexie")) return "storage";
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "HELLO VIETNAM",
          short_name: "Vietnam",
          description: "Our Little Vietnam Trip",
          theme_color: "#FFF8ED",
          background_color: "#FFF8ED",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            { src: base + "icon-192.png", sizes: "192x192", type: "image/png" },
            {
              src: base + "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2,ttf}"],
          navigateFallback: base + "index.html",
          navigateFallbackDenylist: [/^\/auth\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  };
});
