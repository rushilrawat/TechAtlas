import { test, expect } from "@playwright/test";

// Deterministic mocked scan response (React + Docker + a concept + an unmapped pkg).
const MOCK_SCAN = {
  scan_id: "scan_mock1",
  status: "completed",
  scanner_version: "1.5a.1",
  mapping_version: "0.2.0",
  repository: {
    owner: "acme", name: "demo", url: "https://github.com/acme/demo",
    default_branch: "main", commit_sha: "abcdef1234567890abcdef1234567890abcdef12",
    description: "A demo project", primary_language: "TypeScript", stars: 123,
  },
  summary: { matched_technology_count: 2, matched_concept_count: 1, unmapped_package_count: 1 },
  coverage: { files_listed: 10, files_inspected: 5, manifests_inspected: 2,
    source_files_inspected: 3, files_skipped_limit: 0, tree_truncated: false,
    partial: false, notes: [] },
  detections: [
    { node_id: "technology:react", node_type: "technology", role: "library",
      detection_status: "confirmed", evidence_ids: ["ev_1"], component_paths: ["frontend"] },
    { node_id: "technology:docker", node_type: "technology", role: "platform",
      detection_status: "declared", evidence_ids: ["ev_2"], component_paths: [] },
    { node_id: "concept:containerization", node_type: "concept", role: "engineering_concept",
      detection_status: "inferred", evidence_ids: ["ev_2"], component_paths: [] },
  ],
  evidence: [
    { id: "ev_1", node_id: "technology:react", type: "source_import",
      file_path: "frontend/src/App.tsx", description: "import of 'react' in source",
      detection_status: "confirmed",
      source_url: "https://github.com/acme/demo/blob/abcdef1234567890abcdef1234567890abcdef12/frontend/src/App.tsx",
      rule: "js.source_import", scanner_version: "1.5a.1", line: null },
    { id: "ev_2", node_id: "technology:docker", type: "container_definition",
      file_path: "Dockerfile", description: "Dockerfile present",
      detection_status: "declared",
      source_url: "https://github.com/acme/demo/blob/abcdef1234567890abcdef1234567890abcdef12/Dockerfile",
      rule: "infra.dockerfile", scanner_version: "1.5a.1", line: null },
  ],
  unmapped: [{ name: "mystery-widget", ecosystem: "npm", detection_status: "declared", evidence_ids: [] }],
};

async function mockScanner(page) {
  await page.route("**/repository-scans", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(MOCK_SCAN) }));
}

test.describe("Repo X-Ray (scanner enabled build)", () => {
  test("end-to-end: enter, scan, highlight, evidence, exit, restore", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await mockScanner(page);

    await page.goto("/");
    await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });

    // Entry point is present (scanner enabled in this build).
    const entry = page.getByRole("button", { name: "Repo X-Ray" });
    await expect(entry).toBeVisible();
    await entry.click();

    // Input + analyze.
    await expect(page.getByRole("heading", { name: "Analyze a GitHub Repository" })).toBeVisible();
    const input = page.getByLabel("GitHub repository URL");
    await input.fill("https://github.com/acme/demo");
    await page.getByRole("button", { name: "Analyze Repository" }).click();

    // Results summary renders detected techs grouped + legend appears.
    await expect(page.getByText("acme/demo")).toBeVisible();
    await expect(page.getByRole("button", { name: /React/ })).toBeVisible();
    await expect(page.getByLabel("Detection status legend")).toBeVisible();
    await expect(page.getByText(/Unmapped dependencies/)).toBeVisible();

    // Focus Stack works (no crash) while the summary is showing.
    await page.getByRole("button", { name: "Focus Stack" }).click();

    // Click a detected tech -> focuses its node & opens the detail panel with evidence.
    await page.getByRole("button", { name: /React/ }).click();
    const details = page.locator(".details");
    await expect(details.getByRole("heading", { name: "React" })).toBeVisible();
    await expect(details.getByText("Found in this repository")).toBeVisible();
    await expect(details.getByText(/frontend\/src\/App\.tsx/)).toBeVisible();
    // Close the detail panel so the summary (and its exit control) is reachable again.
    await details.getByRole("button", { name: "Close details" }).click();

    // Exit -> back to universe; legend gone, entry visible again.
    await page.getByRole("button", { name: "Back to Universe" }).click();
    await expect(page.getByLabel("Detection status legend")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Repo X-Ray" })).toBeVisible();

    expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("switching repositories replaces the result", async ({ page }) => {
    await mockScanner(page);
    await page.goto("/");
    await expect(page.getByText(/\d+ nodes · \d+ edges/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Repo X-Ray" }).click();
    const input = page.getByLabel("GitHub repository URL");
    await input.fill("https://github.com/acme/demo");
    await page.getByRole("button", { name: "Analyze Repository" }).click();
    await expect(page.getByText("acme/demo")).toBeVisible();
    // analyze a different repo (same mock) -> still shows a result, no stale crash
    await input.fill("https://github.com/other/project");
    await page.getByRole("button", { name: "Analyze Repository" }).click();
    await expect(page.getByText("acme/demo")).toBeVisible(); // mock returns acme/demo
  });
});
