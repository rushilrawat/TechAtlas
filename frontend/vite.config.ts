import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is the sub-path the app is served from. On GitHub Pages the site lives at
// https://<user>.github.io/<repo>/, so the production build is based at /<repo>/.
// Overridable via VITE_BASE; defaults to "/" for local dev and live-backend hosting.
const base = process.env.VITE_BASE ?? "/";

// The dev server proxies /api to the FastAPI backend so the frontend code can use
// relative URLs in development and production alike.
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
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
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
  },
});
