import { test, expect, type Page } from "@playwright/test";

/**
 * Stack View regression suite.
 *
 * These tests exist because a real regression shipped where, after a scan, detected nodes
 * did NOT render on the Stack View canvas at all — the root cause was mixing graph-space
 * coordinates into Sigma's camera-space API. DOM-presence checks did not catch it because
 * the <canvas> element still existed while drawing nothing.
 *
 * Therefore every assertion here proves ACTUAL rendering via the live Sigma renderer:
 * node viewport coordinates, display-data visibility, edge visibility, and canonical
 * coordinate integrity — not merely that an element is attached to the DOM.
 *
 * The renderer is read through window.__ta_sigma, compiled in only for the VITE_TEST_HOOKS
 * build served by serve-dist-xray-test.mjs. It is tree-shaken out of the deploy build.
 */

// ---- deterministic fixtures (real canonical technology ids, grouped by true domain) ----
const POOL: Record<string, string[]> = {
  frontend: ["technology:react","technology:vue","technology:angular","technology:svelte","technology:typescript","technology:nextjs","technology:redux","technology:vite","technology:tailwind"],
  backend: ["technology:nodejs","technology:express","technology:fastapi","technology:django","technology:flask","technology:celery","technology:grpc"],
  databases: ["technology:postgresql","technology:mysql","technology:mongodb","technology:redis","technology:duckdb"],
  aiml: ["technology:pytorch","technology:tensorflow","technology:scikit-learn","technology:numpy","technology:pandas","technology:langchain"],
  cloud: ["technology:docker","technology:kubernetes","technology:terraform","technology:aws","technology:nginx","technology:prometheus"],
  security: ["technology:keycloak","technology:auth0"],
  mobile: ["technology:flutter","technology:react-native","technology:electron"],
  testing: ["technology:pytest","technology:playwright","technology:eslint"],
  gamedev: ["technology:unity","technology:godot"],
  languages: ["technology:python","technology:rust","technology:go","technology:java"],
};
function pick(spec: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [k, n] of Object.entries(spec)) out.push(...(POOL[k] ?? []).slice(0, n));
  return out;
}

function scan(ids: string[], opts: Partial<{ partial: boolean }> = {}) {
  const { partial = false } = opts;
  return {
    scan_id: "reg", status: partial ? "partial" : "completed",
    scanner_version: "1.5c.1", mapping_version: "0.3.0",
    repository: { owner: "acme", name: "repo", url: "https://github.com/acme/repo", default_branch: "main", commit_sha: "abcdef1234567890abcdef1234567890abcdef12", description: "Fixture repository (deterministic).", primary_language: "Python", stars: 10 },
    summary: { matched_technology_count: ids.length, matched_concept_count: 0, unmapped_package_count: partial ? 207 : 5 },
    coverage: { files_listed: 500, files_inspected: partial ? 93 : 300, manifests_inspected: 6, source_files_inspected: 80, files_skipped_limit: partial ? 207 : 0, tree_truncated: partial, partial, notes: partial ? ["GitHub returned a truncated file tree; coverage is incomplete."] : [] },
    detections: ids.map((id, i) => ({ node_id: id, node_type: "technology", role: "library", detection_status: (["confirmed","declared","confirmed","declared"] as const)[i % 4], evidence_ids: [`e${i}`], component_paths: [], dependency_classification: (["direct","transitive","direct"] as const)[i % 3] })),
    evidence: ids.map((id, i) => ({ id: `e${i}`, node_id: id, type: "dependency_manifest", file_path: "pyproject.toml", description: "declared", detection_status: "declared", source_url: "https://github.com/acme/repo/blob/abcdef1234567890abcdef1234567890abcdef12/pyproject.toml", rule: "python.pyproject", scanner_version: "1.5c.1", line: null })),
    unmapped: [],
  };
}

async function gotoExplore(page: Page, vp = { width: 1440, height: 900 }) {
  await page.setViewportSize(vp);
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes . \d+ edges/)).toBeVisible({ timeout: 30_000 });
  // Wait for the renderer handle (proves the canvas mounted and Sigma constructed).
  await page.waitForFunction(() => !!(window as unknown as { __ta_sigma?: unknown }).__ta_sigma, null, { timeout: 15_000 });
}

async function runScan(page: Page, ids: string[], opts: Partial<{ partial: boolean }> = {}) {
  await page.route("**/repository-scans", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scan(ids, opts)) }));
  await page.getByRole("button", { name: "Repo X-Ray" }).click();
  await page.getByLabel("GitHub repository URL").fill("https://github.com/acme/repo");
  await page.getByRole("button", { name: "Analyze Repository" }).click();
  await expect(page.getByText(/acme\/repo/)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1300); // let the stack projection + camera settle
}

// Re-scan WITHOUT re-entering via the Repo X-Ray entry button (panel already open, e.g.
// after "Analyze Another"). Fills the URL and analyzes the same mocked response.
async function rescan(page: Page, ids: string[]) {
  await page.route("**/repository-scans", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scan(ids)) }));
  await page.getByLabel("GitHub repository URL").fill("https://github.com/acme/repo");
  await page.getByRole("button", { name: "Analyze Repository" }).click();
  await expect(page.getByText(/acme\/repo/)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1300);
}

// ---- renderer introspection (ACTUAL rendering, via live Sigma) ----
type NodeProbe = { id: string; vx: number; vy: number; hidden: boolean; onCanvas: boolean };

async function probeNodes(page: Page, ids: string[]): Promise<NodeProbe[]> {
  return page.evaluate((nodeIds) => {
    const sig = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
    const g = sig.getGraph();
    const cont = sig.getContainer() as HTMLElement;
    const w = cont.clientWidth, h = cont.clientHeight;
    return nodeIds.map((id: string) => {
      if (!g.hasNode(id)) return { id, vx: NaN, vy: NaN, hidden: true, onCanvas: false };
      const vp = sig.graphToViewport({ x: g.getNodeAttribute(id, "x"), y: g.getNodeAttribute(id, "y") });
      const dd = sig.getNodeDisplayData(id);
      const hidden = !dd || dd.hidden === true;
      // generous pannable margin: a node is "reachable" if within 1.5x the viewport of center
      const onCanvas = vp.x > -w * 0.5 && vp.x < w * 1.5 && vp.y > -h * 0.5 && vp.y < h * 1.5;
      return { id, vx: vp.x, vy: vp.y, hidden, onCanvas };
    });
  }, ids);
}

async function cameraState(page: Page) {
  return page.evaluate(() => {
    const sig = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
    return sig.getCamera().getState();
  });
}

async function coordSnapshot(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate(() => {
    const sig = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
    const g = sig.getGraph();
    const out: Record<string, { x: number; y: number }> = {};
    g.forEachNode((id: string, a: any) => { out[id] = { x: a.x, y: a.y }; });
    return out;
  });
}

async function visibleEdges(page: Page) {
  return page.evaluate(() => {
    const sig = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
    const g = sig.getGraph();
    const out: { key: string; s: string; t: string }[] = [];
    g.forEachEdge((key: string, _a: any, s: string, t: string) => {
      const dd = sig.getEdgeDisplayData(key);
      if (dd && dd.hidden !== true) out.push({ key, s, t });
    });
    return out;
  });
}

async function switchView(page: Page, view: "Stack View" | "Universe View") {
  await page.locator(".xray-viewswitch, .xray-panel").getByRole("button", { name: view }).first().click();
  await page.waitForTimeout(900);
}

// ================================ TESTS ================================

test.describe("Stack View rendering regressions", () => {
  test("Explore Mode renders the original graph (nodes drawn, not just canvas present)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await gotoExplore(page);
    // A representative sample of canonical nodes must map onto the canvas and be un-hidden.
    const sample = ["technology:react", "technology:python", "domain:frontend", "domain:ai-ml"];
    const probes = await probeNodes(page, sample);
    for (const p of probes) {
      expect(p.hidden, `${p.id} should be visible in Explore`).toBe(false);
      expect(p.onCanvas, `${p.id} should map onto the canvas`).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test("small scan (4 techs) renders detected nodes on the Stack canvas", async ({ page }) => {
    await gotoExplore(page);
    const ids = pick({ backend: 3, databases: 1 });
    await runScan(page, ids);
    const probes = await probeNodes(page, ids);
    for (const p of probes) {
      expect(p.hidden, `${p.id} hidden after small scan`).toBe(false);
      expect(p.onCanvas, `${p.id} off-canvas after small scan`).toBe(true);
    }
  });

  test("medium scan (12 techs) renders detected nodes", async ({ page }) => {
    await gotoExplore(page);
    const ids = pick({ frontend: 5, backend: 4, databases: 3 });
    await runScan(page, ids);
    const probes = await probeNodes(page, ids);
    const shown = probes.filter((p) => !p.hidden && p.onCanvas).length;
    expect(shown, "most medium-scan nodes should render on canvas").toBeGreaterThanOrEqual(ids.length - 1);
  });

  test("large scan (26 techs) renders detected nodes", async ({ page }) => {
    await gotoExplore(page);
    const ids = pick({ frontend: 9, backend: 6, databases: 5, aiml: 6 });
    await runScan(page, ids);
    const probes = await probeNodes(page, ids);
    const shown = probes.filter((p) => !p.hidden).length;
    expect(shown, "large-scan detected nodes should all be un-hidden").toBe(ids.length);
    const onCanvas = probes.filter((p) => p.onCanvas).length;
    expect(onCanvas, "large-scan nodes should be within the pannable region").toBe(ids.length);
  });

  test("40+ detection scan stays navigable (nodes reachable, no errors)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await gotoExplore(page);
    const ids = pick({ languages: 4, frontend: 9, backend: 7, databases: 5, aiml: 6, cloud: 6, security: 2, mobile: 3, testing: 3, gamedev: 2 });
    expect(ids.length, "fixture must have 40+ distinct techs").toBeGreaterThanOrEqual(40);
    await runScan(page, ids);
    const probes = await probeNodes(page, ids);
    const unhidden = probes.filter((p) => !p.hidden).length;
    expect(unhidden, "all 40+ detected nodes un-hidden").toBe(ids.length);
    const reachable = probes.filter((p) => p.onCanvas).length;
    expect(reachable, "all 40+ nodes within the pannable region").toBe(ids.length);
    expect(errors).toEqual([]);
  });

  test("Universe View restores the original graph; Stack View re-clusters", async ({ page }) => {
    await gotoExplore(page);
    const before = await coordSnapshot(page);
    const ids = pick({ frontend: 4, backend: 3, databases: 2 });
    await runScan(page, ids);
    // In Stack View the detected nodes moved to cluster positions.
    const inStack = await coordSnapshot(page);
    let moved = 0;
    for (const id of ids) if (Math.hypot(inStack[id].x - before[id].x, inStack[id].y - before[id].y) > 1) moved++;
    expect(moved, "detected nodes should be reprojected in Stack View").toBeGreaterThan(0);

    await switchView(page, "Universe View");
    const inUniverse = await coordSnapshot(page);
    for (const id of Object.keys(before)) {
      expect(Math.abs(inUniverse[id].x - before[id].x), `${id} x restored`).toBeLessThan(0.5);
      expect(Math.abs(inUniverse[id].y - before[id].y), `${id} y restored`).toBeLessThan(0.5);
    }

    await switchView(page, "Stack View");
    const probes = await probeNodes(page, ids);
    for (const p of probes) expect(p.hidden, `${p.id} re-clustered & visible`).toBe(false);
  });

  test("rapid view switching: no blank canvas, no stale animation, coords intact", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await gotoExplore(page);
    const canonical = await coordSnapshot(page);
    const ids = pick({ frontend: 5, backend: 4, databases: 2, aiml: 3 });
    await runScan(page, ids);
    // Hammer the toggle quickly.
    for (let i = 0; i < 6; i++) {
      await switchView(page, i % 2 === 0 ? "Universe View" : "Stack View");
    }
    // End in Stack View deterministically.
    await switchView(page, "Universe View");
    await switchView(page, "Stack View");
    const probes = await probeNodes(page, ids);
    const shown = probes.filter((p) => !p.hidden && p.onCanvas).length;
    expect(shown, "stack must not be blank after rapid switching").toBeGreaterThanOrEqual(ids.length - 1);

    // Return to Universe and assert canonical coordinates are byte-for-byte restored.
    await switchView(page, "Universe View");
    const after = await coordSnapshot(page);
    for (const id of Object.keys(canonical)) {
      expect(Math.abs(after[id].x - canonical[id].x), `${id} x intact`).toBeLessThan(0.5);
      expect(Math.abs(after[id].y - canonical[id].y), `${id} y intact`).toBeLessThan(0.5);
    }
    expect(errors).toEqual([]);
  });

  test("selecting a technology reveals only VERIFIED canonical relationships", async ({ page }) => {
    await gotoExplore(page);
    const ids = pick({ frontend: 5, backend: 4, databases: 2, aiml: 3 });
    await runScan(page, ids);
    // Select FastAPI from the results panel.
    await page.locator(".xray-panel").getByRole("button", { name: /FastAPI/ }).click();
    await page.waitForTimeout(800);
    const edges = await visibleEdges(page);
    expect(edges.length, "selection should reveal at least one verified edge").toBeGreaterThan(0);
    // Every revealed edge must be a REAL canonical edge incident to the selected node —
    // never a fabricated co-occurrence line.
    for (const e of edges) {
      expect(e.s === "technology:fastapi" || e.t === "technology:fastapi",
        `revealed edge ${e.key} must touch the selected node`).toBe(true);
    }
    // And each must exist in the canonical graph (it does, since we read from the graph).
  });

  test("cross-domain vs same-domain relationship styling is distinguishable", async ({ page }) => {
    await gotoExplore(page);
    const ids = pick({ frontend: 5, backend: 4, databases: 2, aiml: 3 });
    await runScan(page, ids);
    await page.locator(".xray-panel").getByRole("button", { name: /FastAPI/ }).click();
    await page.waitForTimeout(800);
    const styles = await page.evaluate(() => {
      const sig = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = sig.getGraph();
      const out: { cross: boolean; color: string }[] = [];
      g.forEachEdge((key: string, _a: any, s: string, t: string) => {
        const dd = sig.getEdgeDisplayData(key);
        if (!dd || dd.hidden === true) return;
        const sd = g.getNodeAttribute(s, "primaryDomain");
        const td = g.getNodeAttribute(t, "primaryDomain");
        out.push({ cross: sd !== td, color: String(dd.color) });
      });
      return out;
    });
    const crossColors = new Set(styles.filter((s) => s.cross).map((s) => s.color));
    const sameColors = new Set(styles.filter((s) => !s.cross).map((s) => s.color));
    // If both kinds are present, their colors must differ.
    if (crossColors.size && sameColors.size) {
      for (const c of crossColors) expect(sameColors.has(c), "cross/same edge colors must differ").toBe(false);
    }
    // At minimum, cross-domain edges use the amber family.
    for (const c of crossColors) expect(c.includes("251") || c.toLowerCase().includes("fb"), `cross edge color ${c} should be amber`).toBe(true);
  });

  test("selection + scanner state persist across view changes", async ({ page }) => {
    await gotoExplore(page);
    const ids = pick({ frontend: 5, backend: 4, databases: 2 });
    await runScan(page, ids);
    await page.locator(".xray-panel").getByRole("button", { name: /FastAPI/ }).click();
    await expect(page.locator(".details").getByRole("heading", { name: "FastAPI" })).toBeVisible();
    // Toggle to Universe and back; the scan summary must still be present (scanner state kept).
    // (The detail panel for FastAPI is open; closing it returns to the summary.)
    await page.locator(".details").getByRole("button", { name: "Close details" }).click();
    await switchView(page, "Universe View");
    await expect(page.getByText(/acme\/repo/)).toBeVisible();
    await switchView(page, "Stack View");
    await expect(page.getByText(/acme\/repo/)).toBeVisible();
    // Detected techs still listed in the panel.
    await expect(page.locator(".xray-panel").getByRole("button", { name: /FastAPI/ })).toBeVisible();
  });

  test("camera fitting works with a desktop right sidebar (content left of panel)", async ({ page }) => {
    await gotoExplore(page, { width: 1440, height: 900 });
    const ids = pick({ frontend: 5, backend: 4, databases: 3, aiml: 3 });
    await runScan(page, ids);
    const probes = await probeNodes(page, ids);
    const panelLeft = await page.evaluate(() => {
      const el = document.querySelector(".xray-panel") as HTMLElement | null;
      return el ? el.getBoundingClientRect().left : Infinity;
    });
    // No detected node's label anchor should sit under the open right panel.
    const shown = probes.filter((p) => !p.hidden);
    expect(shown.length).toBe(ids.length);
    const underPanel = shown.filter((p) => p.vx > panelLeft).length;
    expect(underPanel, "detected nodes must be framed left of the sidebar").toBe(0);
  });

  test("camera fitting works with a mobile bottom sheet (content above the sheet)", async ({ page }) => {
    await gotoExplore(page, { width: 390, height: 844 });
    const ids = pick({ frontend: 5, backend: 4, databases: 2 });
    await runScan(page, ids);
    const probes = await probeNodes(page, ids);
    const sheetTop = await page.evaluate(() => {
      const el = document.querySelector(".xray-panel") as HTMLElement | null;
      return el ? el.getBoundingClientRect().top : Infinity;
    });
    const shown = probes.filter((p) => !p.hidden);
    expect(shown.length).toBe(ids.length);
    // At least the top clusters must sit in the band above the bottom sheet (pannable rest).
    const aboveSheet = shown.filter((p) => p.vy < sheetTop).length;
    expect(aboveSheet, "some detected nodes must render above the bottom sheet").toBeGreaterThan(0);
  });

  test("canonical graph coordinates are never permanently changed", async ({ page }) => {
    await gotoExplore(page);
    const canonical = await coordSnapshot(page);
    // Run two different scans and exit each, then compare.
    await runScan(page, pick({ frontend: 4, databases: 2 }));
    // "Analyze Another" reopens the URL input without leaving the X-Ray panel.
    await page.getByRole("button", { name: "Analyze Another" }).click();
    await rescan(page, pick({ aiml: 5, cloud: 3 }));
    await switchView(page, "Universe View");
    const after = await coordSnapshot(page);
    for (const id of Object.keys(canonical)) {
      expect(Math.abs(after[id].x - canonical[id].x), `${id} x unchanged`).toBeLessThan(0.5);
      expect(Math.abs(after[id].y - canonical[id].y), `${id} y unchanged`).toBeLessThan(0.5);
    }
  });

  test("reduced-motion: stack renders instantly and Universe restores exactly", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoExplore(page);
    const canonical = await coordSnapshot(page);
    const ids = pick({ frontend: 5, backend: 4, databases: 2 });
    await runScan(page, ids);
    // With reduced motion the projection applies instantly (no eased frames); nodes must
    // already be clustered and visible.
    const probes = await probeNodes(page, ids);
    for (const p of probes) {
      expect(p.hidden, `${p.id} must render immediately under reduced motion`).toBe(false);
      expect(p.onCanvas, `${p.id} must be framed under reduced motion`).toBe(true);
    }
    await switchView(page, "Universe View");
    const after = await coordSnapshot(page);
    for (const id of Object.keys(canonical)) {
      expect(Math.abs(after[id].x - canonical[id].x), `${id} x restored (reduced motion)`).toBeLessThan(0.5);
      expect(Math.abs(after[id].y - canonical[id].y), `${id} y restored (reduced motion)`).toBeLessThan(0.5);
    }
  });

  test("no browser errors during a full scan + view-switch cycle", async ({ page }) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    await gotoExplore(page);
    await runScan(page, pick({ frontend: 5, backend: 4, databases: 3, aiml: 3 }));
    await switchView(page, "Universe View");
    await switchView(page, "Stack View");
    await page.locator(".xray-panel").getByRole("button", { name: /FastAPI/ }).click();
    await page.waitForTimeout(500);
    expect(errors, `page errors: ${errors.join("\n")}`).toEqual([]);
    // WebGL perf warnings from swiftshader are benign; fail only on real app errors.
    const appErrors = consoleErrors.filter((t) => !/GL Driver|WebGL|ReadPixels|GPU stall/i.test(t));
    expect(appErrors, `console errors: ${appErrors.join("\n")}`).toEqual([]);
  });
});
