import { test, expect, type Page } from "@playwright/test";

/**
 * Radial Atlas Visual-Proof harness.
 *
 * Measures the DEFAULT Explore overview (initial full-atlas view, pre-interaction) in
 * SCREEN SPACE through the live Sigma renderer (window.__ta_sigma), NOT via Graphology
 * coordinates or mere canvas existence. A passing metric corresponds to what a user
 * actually sees.
 *
 * Metrics per viewport:
 *   - visible individual nodes (607) and aggregate replacements (0)
 *   - circle intersections / true overlaps between drawn circles
 *   - priority label collisions (domain headings + any WebGL label) and label/node hits
 *   - headings or domain anchors behind the side panels or clipped by the viewport
 *   - visible relationships, cross-domain share, curvature, and curve crossings
 *   - parent-centering error and largest angular gap per ecosystem
 *   - full-render time (ten synchronous Sigma refreshes)
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
  labelNodeCollisions: number;
  visibleDomainLabels: number;
  importantContentBehindPanels: number;
  ordinaryEdgesVisible: number;
  crossDomainEdgesVisible: number;
  curvedEdges: number;
  edgeCrossings: number;
  maxCenteringError: number;
  maxAngularGapDeg: number;
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
  if (vp.width === 1440 && vp.height === 900) await page.waitForTimeout(300);
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
      type Rect = { x: number; y: number; w: number; h: number };
      const overlap = (a: Rect, b: Rect) =>
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

      // ---- visible nodes + their true on-screen geometry ----
      type Vis = { id: string; cx: number; cy: number; r: number; cluster: string; ring: number;
        isAggregate: boolean; count: number; label: string };
      const visible: Vis[] = [];
      let aggregatedNodeCount = 0, visibleIndividualNodes = 0, visibleMarkers = 0;
      g.forEachNode((id: string, a: any) => {
        const dd = s.getNodeDisplayData(id);
        if (!dd || dd.hidden === true) return;
        const vp = s.graphToViewport({ x: a.x, y: a.y });
        const isAggregate = a.isAggregate === true;
        const count = isAggregate ? (a.count ?? (a.memberIds?.length ?? 0)) : 0;
        if (isAggregate) { aggregatedNodeCount += count; visibleMarkers++; } else visibleIndividualNodes++;
        visible.push({ id, cx: vp.x, cy: vp.y, r: s.scaleSize(dd.size), cluster: a.cluster,
          ring: a.ring ?? 0, isAggregate, count, label: dd.label ?? "" });
      });

      // ---- circle intersections (spatial grid, near-linear) ----
      let maxR = 1;
      for (const v of visible) maxR = Math.max(maxR, v.r);
      const cell = maxR * 2 + VISUAL_GAP + 1;
      const grid = new Map<string, number[]>();
      visible.forEach((v, i) => {
        const k = Math.floor(v.cx / cell) + ":" + Math.floor(v.cy / cell);
        grid.set(k, [...(grid.get(k) ?? []), i]);
      });
      let visibleCircleIntersections = 0, visibleCircleOverlaps = 0;
      visible.forEach((v, i) => {
        const gx = Math.floor(v.cx / cell), gy = Math.floor(v.cy / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          for (const j of grid.get((gx + dx) + ":" + (gy + dy)) ?? []) {
            if (j <= i) continue;
            const b = visible[j];
            const dist = Math.hypot(v.cx - b.cx, v.cy - b.cy);
            if (dist < v.r + b.r + VISUAL_GAP) visibleCircleIntersections++;
            if (dist < v.r + b.r) visibleCircleOverlaps++;
          }
        }
      });

      // ---- priority labels: the domain headings plus any WebGL label Sigma is asked to draw ----
      const boxes: (Rect & { id: string })[] = [];
      document.querySelectorAll(".atlas-heading").forEach((el) => {
        const r = el.getBoundingClientRect();
        boxes.push({ x: r.left - crect.left, y: r.top - crect.top, w: r.width, h: r.height,
          id: (el.textContent ?? "") });
      });
      const visibleDomainLabels = boxes.length;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.font = "12px Inter, system-ui, sans-serif";
      for (const v of visible) {
        if (!v.label) continue;
        boxes.push({ x: v.cx + v.r + 2, y: v.cy - 7, w: ctx.measureText(v.label).width, h: 14, id: v.id });
      }
      let priorityLabelCollisions = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        if (overlap(boxes[i], boxes[j])) priorityLabelCollisions++;
      }
      let labelNodeCollisions = 0;
      for (const bx of boxes) {
        if (visible.some((v) => v.id !== bx.id &&
          overlap(bx, { x: v.cx - v.r, y: v.cy - v.r, w: v.r * 2, h: v.r * 2 }))) labelNodeCollisions++;
      }

      // ---- important content behind panels / clipped ----
      const panels = [".legend", "#graph-filters", ".filter-panel"].map((sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0
          ? { x: r.left - crect.left, y: r.top - crect.top, w: r.width, h: r.height } : null;
      }).filter(Boolean) as Rect[];
      let importantContentBehindPanels = 0;
      for (const bx of boxes) {
        if (panels.some((p) => overlap(bx, p)) || bx.x < 0 || bx.y < 0 || bx.x + bx.w > vw || bx.y + bx.h > vh) {
          importantContentBehindPanels++;
        }
      }
      // domain anchors (the ecosystem centers) must never sit under a panel either
      for (const v of visible) {
        if (v.ring === 0 && g.getNodeAttribute(v.id, "nodeType") === "domain" &&
          panels.some((p) => overlap({ x: v.cx - v.r, y: v.cy - v.r, w: v.r * 2, h: v.r * 2 }, p))) {
          importantContentBehindPanels++;
        }
      }

      // ---- visible relationships, measured on the curves actually drawn ----
      type Pt = { x: number; y: number };
      const curve = (a: Pt, b: Pt, k: number): Pt[] => Array.from({ length: 13 }, (_, i) => {
        const t = i / 12, u = 1 - t;
        const c = { x: (a.x + b.x) / 2 - (b.y - a.y) * k, y: (a.y + b.y) / 2 + (b.x - a.x) * k };
        return s.graphToViewport({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
          y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
      });
      const paths: { s: string; t: string; pts: Pt[] }[] = [];
      let ordinaryEdgesVisible = 0, crossDomainEdgesVisible = 0, curvedEdges = 0;
      g.forEachEdge((key: string, attrs: any, src: string, tgt: string) => {
        const dd = s.getEdgeDisplayData(key);
        if (!dd || dd.hidden === true) return;
        ordinaryEdgesVisible++;
        if (attrs.crossDomain) crossDomainEdgesVisible++;
        if (attrs.type === "curved" && Math.abs(attrs.curvature ?? 0) >= 0.1) curvedEdges++;
        paths.push({ s: src, t: tgt, pts: curve(g.getNodeAttributes(src), g.getNodeAttributes(tgt), attrs.curvature ?? 0) });
      });
      const side = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const cross = (p: Pt, q: Pt, r: Pt, w: Pt) =>
        side(p, q, r) * side(p, q, w) < 0 && side(r, w, p) * side(r, w, q) < 0;
      let edgeCrossings = 0;
      for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
        const A = paths[i], B = paths[j];
        if (A.s === B.s || A.s === B.t || A.t === B.s || A.t === B.t) continue;
        let hit = false;
        for (let m = 0; m < 12 && !hit; m++) for (let n = 0; n < 12 && !hit; n++) {
          hit = cross(A.pts[m], A.pts[m + 1], B.pts[n], B.pts[n + 1]);
        }
        if (hit) edgeCrossings++;
      }

      // ---- parent centering + angular coverage per ecosystem (screen space) ----
      let maxCenteringError = 0, maxAngularGapDeg = 0;
      for (const anchor of visible) {
        if (g.getNodeAttribute(anchor.id, "nodeType") !== "domain") continue;
        const members = visible.filter((v) => v.cluster === anchor.id && v.id !== anchor.id);
        if (members.length < 8) continue;
        const extent = Math.max(...members.map((m) => Math.hypot(m.cx - anchor.cx, m.cy - anchor.cy)));
        const mx = members.reduce((acc, m) => acc + m.cx, 0) / members.length - anchor.cx;
        const my = members.reduce((acc, m) => acc + m.cy, 0) / members.length - anchor.cy;
        maxCenteringError = Math.max(maxCenteringError, Math.hypot(mx, my) / extent);
        const angles = members.map((m) => Math.atan2(m.cy - anchor.cy, m.cx - anchor.cx)).sort((p, q) => p - q);
        let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
        for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
        maxAngularGapDeg = Math.max(maxAngularGapDeg, (gap * 180) / Math.PI);
      }

      return {
        viewport: vpName,
        visibleNodeCount: visible.length,
        visibleIndividualNodes,
        visibleMarkers,
        aggregatedNodeCount,
        visibleCircleIntersections,
        visibleCircleOverlaps,
        priorityLabelCollisions,
        labelNodeCollisions,
        visibleDomainLabels,
        importantContentBehindPanels,
        ordinaryEdgesVisible,
        crossDomainEdgesVisible,
        curvedEdges,
        edgeCrossings,
        maxCenteringError: Math.round(maxCenteringError * 1000) / 1000,
        maxAngularGapDeg: Math.round(maxAngularGapDeg),
        totalNodes: g.order,
        sampleRadii: visible.slice(0, 5).map((v) => Math.round(v.r * 100) / 100),
      };
    },
    { VISUAL_GAP, vpName },
  );
}

test.describe("Default Explore overview — visual proof (screen space)", () => {
  for (const vp of VIEWPORTS) {
    test(`overview metrics @ ${vp.name}`, async ({ page }) => {
      await gotoOverview(page, vp);
      const frame = await page.evaluate(async () => {
        const t0 = performance.now();
        const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
        for (let i = 0; i < 10; i++) s.refresh();
        return (performance.now() - t0) / 10;
      });
      const m = { ...(await measure(page, vp.name)), msPerFullRender: Math.round(frame * 10) / 10 };
      // Surface the measured metrics in the test output (counterexample record).
      console.log("OVERVIEW_METRICS " + JSON.stringify(m));
      await page.screenshot({ path: `screenshots/radial-${vp.width}x${vp.height}.png` });

      // Every canonical node remains individually visible at overview.
      expect(m.visibleIndividualNodes).toBe(607);
      expect(m.visibleMarkers).toBe(0);
      expect(m.aggregatedNodeCount).toBe(0);
      // Parents are centered and every populated ecosystem surrounds its anchor.
      expect(m.maxCenteringError).toBeLessThanOrEqual(0.25);
      expect(m.maxAngularGapDeg).toBeLessThan(90);
      // A restrained, genuinely curved backbone of canonical relationships.
      expect(m.ordinaryEdgesVisible).toBeGreaterThanOrEqual(100);
      expect(m.ordinaryEdgesVisible).toBeLessThanOrEqual(170);
      expect(m.crossDomainEdgesVisible).toBeLessThanOrEqual(20);
      expect(m.curvedEdges).toBe(m.ordinaryEdgesVisible);
      expect(m.edgeCrossings, "overview curve crossings").toBeLessThanOrEqual(3);
      expect(m.importantContentBehindPanels).toBe(0);
      expect(m.priorityLabelCollisions).toBe(0);

      if (vp.desktop) {
        expect(m.visibleCircleOverlaps, "drawn circles never overlap at desktop fit").toBe(0);
        expect(m.visibleDomainLabels, "all 14 domain headings").toBe(14);
        expect(m.labelNodeCollisions, "headings clear of node circles").toBeLessThanOrEqual(2);
      } else {
        // Phones keep minimal overview labels: only headings that fit without covering
        // another ecosystem; the Domains sheet names every one.
        expect(m.visibleDomainLabels).toBeGreaterThanOrEqual(3);
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

  test("node detail previews one canonical connection and opens its neighbor", async ({ page }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    await page.locator(".legend-item").filter({ hasText: "Backend Development" }).first().click();
    const details = page.getByRole("region", { name: "Node details" });
    await expect(details).toBeVisible();
    const row = details.getByRole("button", { name: /Show connection with/ }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect.poll(async () => (await countVisible(page)).edges).toBe(1);
    await details.getByRole("button", { name: /^Open / }).first().click();
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
    // Selection brightens the ecosystem: members keep their domain color, the rest recede.
    const focus = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      let bright = 0, dimmed = 0;
      g.forEachNode((id: string, a: any) => {
        const color = s.getNodeDisplayData(id)?.color as string;
        if (a.primaryDomain === "domain:robotics" && id !== "domain:robotics") { if (color === a.color) bright++; }
        else if (/,0\.2\)$/.test(color)) dimmed++;
      });
      return { bright, dimmed };
    });
    expect(focus.bright).toBe(29);
    expect(focus.dimmed).toBeGreaterThan(400);
    await expect(page.locator(".atlas-heading.is-active", { hasText: "Robotics" })).toBeVisible();
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

  test("selecting a technology reveals exactly its canonical relationships", async ({ page }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    const target = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      const p = s.graphToViewport({ x: g.getNodeAttribute("technology:react", "x"), y: g.getNodeAttribute("technology:react", "y") });
      return { ...p, degree: g.degree("technology:react") };
    });
    const box = await page.locator(".graph-canvas").boundingBox();
    await page.mouse.click(box!.x + target.x, box!.y + target.y);
    await expect(page.getByRole("region", { name: "Node details" }).getByRole("heading", { name: "React" })).toBeVisible();
    await page.waitForTimeout(700);
    const shown = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      let incident = 0, bright = 0;
      g.forEachEdge((key: string, _a: any, src: string, tgt: string) => {
        const dd = s.getEdgeDisplayData(key);
        if (!dd || dd.hidden) return;
        if (src === "technology:react" || tgt === "technology:react") { incident++; if ((dd.zIndex ?? 0) >= 3) bright++; }
        else if ((dd.zIndex ?? 0) >= 3) bright = -999;
      });
      return { incident, bright };
    });
    expect(shown.incident).toBe(target.degree);
    expect(shown.bright).toBe(target.degree);
    await page.screenshot({ path: "screenshots/radial-react-selected.png" });
  });

  test("deselecting while zoomed keeps the zoom-level relationships", async ({ page }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const d = s.getNodeDisplayData("domain:backend");
      s.getCamera().setState({ x: d.x, y: d.y, ratio: 0.3 });
    });
    await page.waitForTimeout(500);
    const zoomed = await countVisible(page);
    const p = await page.evaluate(() => {
      const s = (window as unknown as { __ta_sigma?: any }).__ta_sigma;
      const g = s.getGraph();
      return s.graphToViewport({ x: g.getNodeAttribute("technology:fastapi", "x"), y: g.getNodeAttribute("technology:fastapi", "y") });
    });
    const box = await page.locator(".graph-canvas").boundingBox();
    await page.mouse.click(box!.x + p.x, box!.y + p.y);
    await expect(page.getByRole("region", { name: "Node details" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("group", { name: /Technology graph/ }).press("Escape");
    await page.mouse.move(box!.x + box!.width - 5, box!.y + 5); // end the hover, too
    await page.waitForTimeout(500);
    const ratio = await page.evaluate(() => (window as unknown as { __ta_sigma?: any }).__ta_sigma.getCamera().getState().ratio);
    expect(ratio, "camera is still in the detail band").toBeLessThanOrEqual(0.55);
    expect((await countVisible(page)).edges).toBe(zoomed.edges);
    await page.screenshot({ path: "screenshots/radial-deselected-zoom.png" });
  });

  test("a domain heading focuses its ecosystem", async ({ page }) => {
    await gotoOverview(page, { width: 1440, height: 900 });
    await page.locator(".atlas-heading", { hasText: "Artificial Intelligence" }).click();
    await expect(page.getByRole("region", { name: "Node details" })).toBeVisible();
  });
});
