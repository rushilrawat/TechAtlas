import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is the sub-path the app is served from. On GitHub Pages the site lives at
// https://<user>.github.io/<repo>/, so the production build is based at /<repo>/.
// Overridable via VITE_BASE; defaults to "/" for local dev and live-backend hosting.
const base = process.env.VITE_BASE ?? "/";

// Live development proxies /api to FastAPI. Static development serves the checked-in
// public/api snapshot directly; proxying it would swallow those JSON files.
export default defineConfig({
  base,
  define: { __DATA_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  plugins: [react()],
  server: {
    port: 5173,
    // Guided paths are imported from ../data/seed/journeys.json.
    fs: { allow: [".."] },
    proxy: process.env.VITE_STATIC_API === "true" ? undefined : {
      "/api": {
        target: process.env.TECHATLAS_API ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
    // Playwright specs under e2e/ are run by Playwright, not vitest.
    // Playwright specs (e2e/ and the local .uia-shots/ screenshot harness) are run by
    // Playwright, not vitest.
    exclude: ["node_modules/**", "dist/**", "dist-xray/**", "e2e/**", ".uia-shots/**"],
  },
});
