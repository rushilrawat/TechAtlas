import { defineConfig } from "@playwright/test";

// Browser smoke test for the PRODUCTION build (static mode) under the GitHub Pages
// base path /TechAtlas/. This is intentionally separate from the vitest unit suite:
// it runs a real Chromium so Sigma's WebGL rendering is actually exercised — an
// HTTP 200 (or a jsdom unit test) cannot prove the graph renders.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: /xray\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4178/TechAtlas/",
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    // Software WebGL so Sigma renders in headless CI (no GPU).
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  // Serve the built dist under /TechAtlas/ exactly like GitHub Pages.
  webServer: {
    command: "node e2e/serve-dist.mjs",
    url: "http://localhost:4178/TechAtlas/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
