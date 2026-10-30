import { test, expect } from "@playwright/test";

// Production-build browser smoke test. Proves the app actually RENDERS and is
// interactive — the gap that let the Graphology crash reach production while CI
// (unit tests + HTTP 200) stayed green.

test("graph renders, a node can be selected, and the detail panel opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");

  // 1) The app left the loading state and the header shows a real node count
  //    (proves /graph loaded AND buildGraph did not throw).
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });

  // 2) Sigma mounted a WebGL canvas inside the graph application region.
  const canvas = page.locator(".graph-canvas canvas").first();
  await expect(canvas).toBeVisible();

  // 3) No uncaught page errors during render (the crash manifested as a pageerror).
  expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);

  // 4) Selection + detail panel via the deterministic search path.
  const search = page.getByLabel("Search the technology graph");
  await search.click();
  await search.fill("react");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();

  // Detail panel opens with the node name and relationships.
  const panel = page.locator(".details");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "React" })).toBeVisible();
});

test("the Tailwind node (id != slug) opens without a 404", async ({ page }) => {
  // Regression for the static id/slug bug: technology:tailwind has slug tailwind-css.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });

  const search = page.getByLabel("Search the technology graph");
  await search.click();
  await search.fill("tailwind");
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();

  const panel = page.locator(".details");
  await expect(panel).toBeVisible();
  // The panel must show the loaded node, NOT the "could not load" error.
  await expect(panel.getByText(/Could not load this node/)).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Tailwind CSS" })).toBeVisible();
});

test("deep link under the base path loads the right node", async ({ page }) => {
  await page.goto("/technology/fastapi");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });
  const panel = page.locator(".details");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "FastAPI" })).toBeVisible();
});

test("selecting a second node (via search) updates the panel — no stale highlight", async ({ page }) => {
  // Regression for the selection-highlight bug: a selection coming from search must
  // update the graph/panel, and switching to another node must swap cleanly.
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });

  const search = page.getByLabel("Search the technology graph");
  const panel = page.locator(".details");

  await search.click();
  await search.fill("react");
  await page.getByRole("option").first().click();
  await expect(panel.getByRole("heading", { name: "React" })).toBeVisible();

  // Pick a different node; the panel must now show it (not the stale first one).
  await search.click();
  await search.fill("fastapi");
  await page.getByRole("option").first().click();
  await expect(panel.getByRole("heading", { name: "FastAPI" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "React" })).toHaveCount(0);
});

// The Repo X-Ray entry point is gated on the build-time VITE_SCANNER_API variable
// (frontend/src/api/scanner.ts -> SCANNER_ENABLED). The same variable is set on the
// job that builds AND runs this suite, so the test process reads it from process.env to
// assert the behavior that matches the build under test. Both scenarios are defined as
// tests; the one that does not match the current build configuration is marked skipped
// (never removed) so the opposite case stays documented and runs under the other config.
const SCANNER_CONFIGURED =
  typeof process.env.VITE_SCANNER_API === "string" &&
  process.env.VITE_SCANNER_API.trim().length > 0;

test("Repo X-Ray entry is visible when the scanner IS configured", async ({ page }) => {
  test.skip(!SCANNER_CONFIGURED, "VITE_SCANNER_API is unset for this build");
  // This build has VITE_SCANNER_API set (e.g. the production Pages deploy pointing at
  // the Render backend), so the Repo X-Ray entry point must be present and usable.
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Repo X-Ray" })).toBeVisible();
});

test("Repo X-Ray entry is hidden when the scanner is NOT configured", async ({ page }) => {
  test.skip(SCANNER_CONFIGURED, "VITE_SCANNER_API is set for this build");
  // This build has no VITE_SCANNER_API, matching a scanner-less static deploy.
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Repo X-Ray" })).toHaveCount(0);
});
