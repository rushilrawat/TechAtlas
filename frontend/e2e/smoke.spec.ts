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

test("the Tailwind node (slug tailwind-css) opens without a 404", async ({ page }) => {
  // Regression for the static id/slug bug (the node was technology:tailwind with slug
  // tailwind-css until dataset 0.7.0; detail files are resolved by slug).
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

// Repo X-Ray is always reachable. Whether live scanning is offered depends on the
// build-time VITE_SCANNER_API variable (frontend/src/api/scanner.ts -> SCANNER_ENABLED),
// which is set on the job that builds AND runs this suite, so the test reads it from
// process.env. Pre-computed example scans (public/example-scans/) work in both builds.
const SCANNER_CONFIGURED =
  typeof process.env.VITE_SCANNER_API === "string" &&
  process.env.VITE_SCANNER_API.trim().length > 0;

test("Repo X-Ray is visible and an example scan loads without a backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Repo X-Ray" }).click();
  const panel = page.getByRole("region", { name: "Repo X-Ray" });
  await expect(panel.getByLabel("GitHub repository URL")).toHaveCount(SCANNER_CONFIGURED ? 1 : 0);
  await panel.getByRole("button", { name: /X-ray django\/django/ }).click();
  await expect(panel.getByRole("link", { name: "django/django" })).toBeVisible();
  await expect(panel.getByText("Example scan")).toBeVisible();
  // The example is in the URL, so the result can be shared.
  await expect(page).toHaveURL(/[?&]xray=django-django/);
});

test("An ?xray= link opens straight onto that example scan", async ({ page }) => {
  await page.goto("./?xray=bevyengine-bevy");
  const panel = page.getByRole("region", { name: "Repo X-Ray" });
  await expect(panel.getByRole("link", { name: "bevyengine/bevy" })).toBeVisible({ timeout: 20_000 });
  await panel.getByRole("button", { name: "Back to Universe" }).first().click();
  await expect(page).not.toHaveURL(/xray=/);
});

test("About page has a direct static route", async ({ page }) => {
  await page.goto("/TechAtlas/about/");
  await expect(page.getByRole("heading", { name: "About the data" })).toBeVisible();
  await expect(page.getByText(/Dataset version/)).toBeVisible();
  await page.getByRole("button", { name: "Back to atlas" }).first().click();
  await expect(page.locator(".graph-canvas")).toBeVisible();
});

test("Guided paths library: search, start a path, step through, share", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Guided paths" }).click();
  const library = page.getByRole("dialog", { name: "Guided paths" });
  await expect(library.getByText("Start here")).toBeVisible();
  await library.getByLabel("Search guided paths").fill("kubernetes");
  await expect(library.getByText(/matching path/)).toBeVisible();
  await library.getByLabel("Search guided paths").fill("");
  await library.getByRole("button", { name: /^How a web request works/ }).first().click();
  await expect(library).toHaveCount(0);
  const panel = page.getByRole("region", { name: "Guided path" });
  await expect(panel.getByText("Step 1 of")).toBeVisible();
  await panel.getByRole("button", { name: "Next" }).click();
  await expect(panel.getByText("Step 2 of")).toBeVisible();
  await expect(page).toHaveURL(/[?&]path=how-a-web-request-works/);
  // Reopening the library marks the path as in progress.
  await panel.getByRole("button", { name: "All paths" }).click();
  await expect(library.getByText(/Step 2 of/).first()).toBeVisible();
});
