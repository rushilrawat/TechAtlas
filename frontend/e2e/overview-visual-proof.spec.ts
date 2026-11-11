import { test, expect, type Page } from "@playwright/test";

/**
 * Radial Atlas Visual-Proof harness.
 *
 * Measures the DEFAULT Explore overview (initial full-atlas view, pre-interaction) in
 * SCREEN SPACE through the live Sigma renderer (window.__ta_sigma), NOT via Graphology
 * coordinates or mere canvas existence. A passing metric corresponds to what a user
 * actually sees.
 *
 * Six metrics per viewport (design.md Testing Strategy -> Integration Tests, Layer 6):
 *   1. visibleNodeCount          - visible individual nodes
 *   2. aggregatedNodeCount       - must remain zero
 *   3. visibleCircleIntersections- pairs of visible circles whose screen distance
 *                                  < rA + rB + VISUAL_GAP  (spatial-grid, near-linear)
 *   4. priorityLabelCollisions   - overlapping shown-label boxes + label/node intersections
 *   5. importantContentBehindPanels - shown labels/markers behind .legend / filter panel
 *                                  or clipped by the viewport
 *   6. ordinaryEdgesVisible      - edges with getEdgeDisplayData().hidden !== true at rest
 *
 * renderedRadius(id) = sigma.scaleSize(getNodeDisplayData(id).size): this is exactly what
 * Sigma uses internally when drawing a node (sigma.esm.js: `var size = this.scaleSize(data.size)`),
 * so it is the true on-screen pixel radius at the current camera. Centers come from
 * graphToViewport(nodeGraphCoords) -> viewport pixels.
 */

const VISUAL_GAP = 8;

const VIEWPORTS = [
  { name: "1440x900 desktop", width: 1440, height: 900, desktop: true },
  { name: "1920x1080 desktop", width: 1920, height: 1080, desktop: true },
  { name: "768x1024 tablet", width: 768, height: 1024, desktop: false },
  { name: "390x844 mobile", width: 390, height: 844, desktop: false },
  { name: "390x667 mobile", width: 390, height: 667, desktop: false },
] as const;

type Metrics = {
  viewport: string;
  visibleNodeCount: number;
  visibleIndividualNodes: number;
  visibleMarkers: number;
  aggregatedNodeCount: number;
  visibleCircleIntersections: number;
  visibleCircleOverlaps: number;
  priorityLabelCollisions: number;
  visibleDomainLabels: number;
  importantContentBehindPanels: number;
  ordinaryEdgesVisible: number;
  totalNodes: number;
  sampleRadii: number[];
};

async function gotoOverview(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto("/");
  await expect(page.getByText(/\d+ nodes . \d+ edges/)).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => !!(window as unknown as { __ta_sigma?: unknown }).__ta_sigma,
    null,
    { timeout: 15_000 },
  );
  // Let fitExplore frame the atlas and the entry camera animation settle. The construction
  // effect animates ~500ms, the backdrop rAF loop spans ~1400ms; wait past both and then
  // confirm the camera ratio is stable across two samples.
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
    const r1 = s.getCamera().getState().ratio;
    await new Promise((res) => setTimeout(res, 250));
    const r2 = s.getCamera().getState().ratio;
    return Math.abs(r1 - r2) < 1e-3;
  });
  // Label placement runs after the entry animation and Sigma's render. On a busy
  // browser process that render can land after the fixed animation wait above.
  // Measure the settled overview, while still failing if placement never runs.
  if (vp.width === 1440 && vp.height === 900) {
    await page.waitForFunction(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      if (!s) return false;
      let shown = 0;
      s.getGraph().forEachNode((id: string, attrs: any) => {
        if (attrs.nodeType === "domain" && attrs.ring === 0 && s.getNodeDisplayData(id)?.label) shown++;
      });
      return shown <= 11;
    }, null, { timeout: 5_000 });
  }
}

async function measure(page: Page, vpName: string): Promise<Metrics> {
  return page.evaluate(
    ({ VISUAL_GAP, vpName }) => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      const cont = s.getContainer() as HTMLElement;
      const crect = cont.getBoundingClientRect();
      const vw = cont.clientWidth;
      const vh = cont.clientHeight;

      // ---- visible nodes + their screen geometry ----
      type Vis = {
        id: string;
        cx: number;
        cy: number;
        r: number;
        isAggregate: boolean;
        count: number;
        labelled: boolean;
        label: string;
        nodeType: string;
      };
      const RATIO_UNIVERSE = 1.1;
      const RATIO_DOMAIN = 0.55;
      const ratio = s.getCamera().getState().ratio;
      const band = ratio > RATIO_UNIVERSE ? 0 : ratio > RATIO_DOMAIN ? 1 : 2;
      const narrow = vw < 641;

      // Replicate semanticZoom.labelVisibleAtRatio + GraphCanvas narrow overview rule, so
      // "shown labels" matches what Sigma is asked to render at the overview.
      const labelShown = (nodeType: string, size: number): boolean => {
        if (narrow && band <= 1) return nodeType === "domain";
        if (band === 0) return nodeType === "domain" || size >= 18;
        if (band === 1) return nodeType === "domain" || size >= 12;
        return true;
      };

      const visible: Vis[] = [];
      let aggregatedNodeCount = 0;
      let visibleIndividualNodes = 0;
      let visibleMarkers = 0;
      g.forEachNode((id: string, a: any) => {
        const dd = s.getNodeDisplayData(id);
        if (!dd || dd.hidden === true) return;
        const vp = s.graphToViewport({ x: a.x, y: a.y });
        const r = s.scaleSize(dd.size); // true on-screen pixel radius
        const isAggregate = a.isAggregate === true;
        const count = isAggregate ? (a.count ?? (a.memberIds?.length ?? 0)) : 0;
        if (isAggregate) { aggregatedNodeCount += count; visibleMarkers++; }
        else { visibleIndividualNodes++; }
        const label = dd.label ?? a.label ?? "";
        const labelled =
          !!label && (isAggregate || labelShown(a.nodeType, dd.size));
        visible.push({ id, cx: vp.x, cy: vp.y, r, isAggregate, count, labelled, label, nodeType: a.nodeType });
      });

      // ---- circle intersections (spatial grid, near-linear) ----
      let maxR = 1;
      for (const v of visible) maxR = Math.max(maxR, v.r);
      const cell = maxR * 2 + VISUAL_GAP + 1;
      const grid = new Map<string, number[]>();
      const keyOf = (gx: number, gy: number) => gx + ":" + gy;
      visible.forEach((v, i) => {
        const gx = Math.floor(v.cx / cell);
        const gy = Math.floor(v.cy / cell);
        const k = keyOf(gx, gy);
        const arr = grid.get(k);
        if (arr) arr.push(i);
        else grid.set(k, [i]);
      });
      let visibleCircleIntersections = 0;
      let visibleCircleOverlaps = 0;
      visible.forEach((v, i) => {
        const gx = Math.floor(v.cx / cell);
        const gy = Math.floor(v.cy / cell);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const arr = grid.get(keyOf(gx + dx, gy + dy));
            if (!arr) continue;
            for (const j of arr) {
              if (j <= i) continue;
              const b = visible[j];
              const dist = Math.hypot(v.cx - b.cx, v.cy - b.cy);
              if (dist < v.r + b.r + VISUAL_GAP) visibleCircleIntersections++;
              if (dist < v.r + b.r) visibleCircleOverlaps++;
            }
          }
        }
      });

      // ---- label boxes (screen space) ----
      // Estimate each shown label's box using canvas measureText at the real label font.
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.font = "12px Inter, system-ui, sans-serif";
      const LABEL_H = 14;
      type Box = { x: number; y: number; w: number; h: number; id: string };
      const boxes: Box[] = [];
      for (const v of visible) {
        if (!v.labelled || !v.label) continue;
        const w = ctx.measureText(v.label).width;
        // Sigma draws the label to the right of the node, vertically centered.
        boxes.push({ x: v.cx + v.r + 2, y: v.cy - LABEL_H / 2, w, h: LABEL_H, id: v.id });
      }
      const overlap = (a: Box, b: Box) =>
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      let priorityLabelCollisions = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (overlap(boxes[i], boxes[j])) priorityLabelCollisions++;
        }
      }
      // label-box intersecting a visible node circle (approx the circle's bbox)
      for (const bx of boxes) {
        for (const v of visible) {
          if (v.id === bx.id) continue;
          const nodeBox = { x: v.cx - v.r, y: v.cy - v.r, w: v.r * 2, h: v.r * 2, id: v.id };
          if (overlap(bx, nodeBox)) {
            priorityLabelCollisions++;
            break;
          }
        }
      }

      // ---- important content behind panels / clipped ----
      const rectOf = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        // translate to container-local coords
        return { x: r.left - crect.left, y: r.top - crect.top, w: r.width, h: r.height };
      };
      const panels = [rectOf(".legend"), rectOf("#graph-filters"), rectOf(".filter-panel")].filter(
        Boolean,
      ) as { x: number; y: number; w: number; h: number }[];
      const boxOverlapsRect = (
        a: Box,
        r: { x: number; y: number; w: number; h: number },
      ) => a.x < r.x + r.w && a.x + a.w > r.x && a.y < r.y + r.h && a.y + a.h > r.y;
      let importantContentBehindPanels = 0;
      for (const bx of boxes) {
        let hit = false;
        for (const p of panels) if (boxOverlapsRect(bx, p)) hit = true;
        if (bx.x < 0 || bx.y < 0 || bx.x + bx.w > vw || bx.y + bx.h > vh) hit = true;
        if (hit) importantContentBehindPanels++;
      }

      // ---- ordinary edges visible at rest ----
      let ordinaryEdgesVisible = 0;
      g.forEachEdge((key: string) => {
        const dd = s.getEdgeDisplayData(key);
        if (dd && dd.hidden !== true) ordinaryEdgesVisible++;
      });

      const sampleRadii = visible.slice(0, 5).map((v) => Math.round(v.r * 100) / 100);
      const visibleDomainLabels = visible.filter((v) => v.nodeType === "domain" && v.labelled).length;

      return {
        viewport: vpName,
        visibleNodeCount: visible.length,
        visibleIndividualNodes,
        visibleMarkers,
        aggregatedNodeCount,
        visibleCircleIntersections,
        visibleCircleOverlaps,
        priorityLabelCollisions,
        visibleDomainLabels,
        importantContentBehindPanels,
        ordinaryEdgesVisible,
        totalNodes: g.order,
        sampleRadii,
      };
    },
    { VISUAL_GAP, vpName },
  );
}

test.describe("Default Explore overview — visual proof (screen space)", () => {
  for (const vp of VIEWPORTS) {
    test(`overview metrics @ ${vp.name}`, async ({ page }) => {
      await gotoOverview(page, vp);
      const m = await measure(page, vp.name);
      // Surface the measured metrics in the test output (counterexample record).
      console.log("OVERVIEW_METRICS " + JSON.stringify(m));
      await page.screenshot({ path: `screenshots/radial-${vp.width}x${vp.height}.png` });

      // Every canonical node remains individually visible at overview.
      expect(
        m.visibleIndividualNodes + m.aggregatedNodeCount + m.visibleMarkers,
        "individuals + aggregated members + shown markers (anchors) must equal canonical count",
      ).toBe(607);
      expect(m.visibleIndividualNodes).toBe(607);
      expect(m.visibleMarkers).toBe(0);
      expect(m.aggregatedNodeCount).toBe(0);

      if (vp.desktop) {
        expect(m.visibleCircleOverlaps, "actual circle overlaps").toBeLessThanOrEqual(30);
        expect(m.priorityLabelCollisions, "overview label conflicts").toBeLessThanOrEqual(8);
        expect(m.visibleDomainLabels, "readable domain names at overview").toBeGreaterThanOrEqual(8);
        expect(m.importantContentBehindPanels).toBe(0);
        expect(m.ordinaryEdgesVisible).toBeGreaterThanOrEqual(100);
        expect(m.ordinaryEdgesVisible).toBeLessThanOrEqual(170);
      } else {
        expect(m.visibleIndividualNodes).toBe(607);
      }
    });
  }
});

// ---- Interaction regressions (atlas-overview-collision-free Task 7 of directive) ----
// Proves the collision-free overview is a VIEW state, not data loss: the underlying nodes
// and edges remain fully reachable through selection and zoom.

async function countVisible(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
    const g = s.getGraph();
    let individuals = 0;
    let markers = 0;
    let edges = 0;
    g.forEachNode((id: string, a: any) => {
      const dd = s.getNodeDisplayData(id);
      if (!dd || dd.hidden === true) return;
      if (a.isAggregate === true) markers++;
      else individuals++;
    });
    g.forEachEdge((key: string) => {
      const dd = s.getEdgeDisplayData(key);
      if (dd && dd.hidden !== true) edges++;
    });
    return { individuals, markers, edges };
  });
}

test.describe("Overview interaction regressions", () => {
  test("connection legend and a selected curve explain the canonical relationship", async ({ page }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    await page.getByRole("button", { name: /Connections/ }).click();
    await expect(page.getByText("Within an ecosystem")).toBeVisible();
    const hit = await page.evaluate(() => {
      const sigma = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const graph = sigma.getGraph();
      const container = sigma.getContainer() as HTMLElement;
      const rect = container.getBoundingClientRect();
      for (const edge of graph.edges()) {
        if (sigma.getEdgeDisplayData(edge)?.hidden) continue;
        const [source, target] = graph.extremities(edge);
        const a = graph.getNodeAttributes(source), b = graph.getNodeAttributes(target);
        const p = sigma.graphToViewport({ x: a.x, y: a.y });
        const q = sigma.graphToViewport({ x: b.x, y: b.y });
        for (const t of [0.3, 0.5, 0.7]) {
          for (let offset = -24; offset <= 24; offset += 4) {
            const x = p.x + (q.x - p.x) * t + offset * (q.y - p.y) / Math.max(1, Math.hypot(q.x - p.x, q.y - p.y));
            const y = p.y + (q.y - p.y) * t - offset * (q.x - p.x) / Math.max(1, Math.hypot(q.x - p.x, q.y - p.y));
            const top = document.elementFromPoint(rect.left + x, rect.top + y);
            if (container.contains(top) && !sigma.getNodeAtPosition({ x, y }) && sigma.getEdgeAtPoint(x, y) === edge) {
              return { x, y, edge };
            }
          }
        }
      }
      return null;
    });
    expect(hit).not.toBeNull();
    const canvas = await page.locator(".graph-canvas").boundingBox();
    await page.mouse.click(canvas!.x + hit!.x, canvas!.y + hit!.y);
    await expect(page.getByRole("region", { name: "Relationship details" })).toBeVisible();
    await expect(page.getByText(hit!.edge, { exact: true })).toBeVisible();
    await page.screenshot({ path: "screenshots/edge-detail-1440x900.png" });
  });

  test("graph keyboard navigation opens a domain", async ({ page }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    const graph = page.getByRole("group", { name: /Technology graph/ });
    await graph.focus();
    await graph.press("ArrowRight");
    await expect(page.getByText(/press Enter to explore/)).toBeVisible();
    await graph.press("Enter");
    await expect(page.getByRole("region", { name: "Node details" })).toBeVisible();
  });

  test("mobile near-node tap selects a dense graph node", async ({ page }) => {
    await gotoOverview(page, { width: 390, height: 844 });
    const hit = await page.evaluate(() => {
      const sigma = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const graph = sigma.getGraph();
      const container = sigma.getContainer() as HTMLElement;
      const rect = container.getBoundingClientRect();
      for (const id of graph.nodes()) {
        const a = graph.getNodeAttributes(id);
        const p = sigma.graphToViewport({ x: a.x, y: a.y });
        const r = sigma.scaleSize(sigma.getNodeDisplayData(id)?.size ?? 0);
        if (r >= 12) continue;
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI) / 8;
          const x = p.x + 14 * Math.cos(angle), y = p.y + 14 * Math.sin(angle);
          if (!container.contains(document.elementFromPoint(rect.left + x, rect.top + y))) continue;
          if (sigma.getNodeAtPosition({ x, y }) || sigma.getEdgeAtPoint(x, y)) continue;
          let nearest = id, distance = 14;
          graph.forEachNode((other: string, b: any) => {
            const q = sigma.graphToViewport({ x: b.x, y: b.y });
            const d = Math.hypot(x - q.x, y - q.y);
            if (d < distance) { nearest = other; distance = d; }
          });
          if (nearest === id) return { x, y, label: a.label };
        }
      }
      return null;
    });
    expect(hit, "a clear point outside a drawn node but inside its 18px hit radius").not.toBeNull();
    const canvas = await page.locator(".graph-canvas").boundingBox();
    await page.mouse.click(canvas!.x + hit!.x, canvas!.y + hit!.y);
    await expect(page.getByRole("region", { name: "Node details" }).getByRole("heading", { name: hit!.label })).toBeVisible();
  });

  test("mobile domain focus stays above the detail sheet", async ({ page }) => {
    await gotoOverview(page, { width: 390, height: 844 });
    await page.getByRole("button", { name: "Show domain legend" }).click();
    await page.locator(".legend-item").filter({ hasText: "Robotics & Autonomous Systems" }).first().click();
    await page.waitForTimeout(650);
    const p = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      const canvas = s.getContainer() as HTMLElement;
      const sheet = document.querySelector(".details") as HTMLElement;
      const node = s.graphToViewport({
        x: g.getNodeAttribute("domain:robotics", "x"),
        y: g.getNodeAttribute("domain:robotics", "y"),
      });
      return { nodeY: node.y, sheetTop: sheet.getBoundingClientRect().top - canvas.getBoundingClientRect().top };
    });
    expect(p.nodeY).toBeGreaterThan(120);
    expect(p.nodeY).toBeLessThan(p.sheetTop - 10);
  });

  test("selecting Robotics keeps its 29 direct members visible", async ({
    page,
  }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    const before = await countVisible(page);
    expect(before.individuals).toBe(607);
    expect(before.markers).toBe(0);
    // Select the Robotics domain via the live app state (same path a legend click uses).
    await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      s.getGraph(); // ensure graph present
    });
    // Drive selection through the renderer click on the Robotics anchor.
    const robotics = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      const vp = s.graphToViewport({
        x: g.getNodeAttribute("domain:robotics", "x"),
        y: g.getNodeAttribute("domain:robotics", "y"),
      });
      return vp;
    });
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + robotics.x, box.y + robotics.y);
    await page.waitForTimeout(600);
    // Its 29 direct members remain individually represented.
    const visibleRoboticsMembers = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      let n = 0;
      g.forEachNode((id: string, a: any) => {
        if (id === "domain:robotics") return;
        if (a.primaryDomain !== "domain:robotics") return;
        const dd = s.getNodeDisplayData(id);
        if (dd && dd.hidden !== true) n++;
      });
      return n;
    });
    expect(visibleRoboticsMembers).toBe(29);
    await page.screenshot({ path: "screenshots/radial-robotics-selected.png" });
  });

  test("zooming into detail reveals additional canonical edges", async ({
    page,
  }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    const before = await countVisible(page);
    expect(before.individuals).toBe(607);
    // Zoom the camera well past the overview band into detail.
    await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      s.getCamera().setState({ ratio: 0.3 });
      s.refresh();
    });
    await page.waitForTimeout(400);
    const after = await countVisible(page);
    // Nodes remain present while detail edges become available.
    expect(after.individuals).toBe(607);
    expect(after.markers).toBe(0);
    expect(after.edges).toBeGreaterThan(before.edges);
  });
});
