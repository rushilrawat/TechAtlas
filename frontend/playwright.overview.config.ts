import { defineConfig } from "@playwright/test";

// Overview visual-proof suite. Runs against the TEST-HOOKS build (dist-xray-test, built
// with VITE_TEST_HOOKS=true) served on port 4180, so the tests read the LIVE Sigma renderer
// (window.__ta_sigma) and assert the ACTUAL default-overview rendering in screen space:
// zero node-circle intersections, zero visible ordinary edges, zero priority-label
// collisions, and zero important content behind the side panels — across five viewports.
// The hook is tree-shaken out of the real deploy build (dist-xray).
export default defineConfig({
  testDir: "./e2e",
  testMatch: /overview-visual-proof\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4180/TechAtlas/",
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "node e2e/serve-dist-xray-test.mjs",
    url: "http://localhost:4180/TechAtlas/",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
