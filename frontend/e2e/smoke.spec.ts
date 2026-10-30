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
