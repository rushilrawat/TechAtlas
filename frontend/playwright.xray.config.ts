import { defineConfig } from "@playwright/test";

// Runs the Repo X-Ray e2e against a SCANNER-ENABLED static build (dist-xray), served
// under /TechAtlas/ on a separate port. The default playwright.config.ts covers the
// scanner-DISABLED smoke tests, proving the public Pages build works without a backend.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /xray\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4179/TechAtlas/",
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "node e2e/serve-dist-xray.mjs",
    url: "http://localhost:4179/TechAtlas/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
