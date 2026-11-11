import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import type { DetectionStatus, GraphResponse } from "../api/types";
import { buildGraph, domainMemberIds } from "../graph/buildGraph";
import { bandOf, labelVisibleAtRatio, selectPersistentLabels } from "../graph/semanticZoom";
import type { LabelContext } from "../graph/semanticZoom";
import { placeLabels } from "../graph/overviewLod";
import { selectClearEdges } from "../graph/clearEdges";
import EdgeCurveProgram from "@sigma/edge-curve";
import { computeFit } from "../graph/cameraFit";

interface Props {
  data: GraphResponse;
  selectedId: string | null;
  selectedEdgeId?: string | null;
  previewEdgeId?: string | null;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  onSelectEdge?: (id: string) => void;
  // Phase 1B filtering (requirements 1.6–1.10). null means "no filter: show all".
  // When present, only ids in these sets are shown; coordinates are never recomputed.
  visibleNodes?: Set<string> | null;
  visibleEdges?: Set<string> | null;
  // Phase 1.5B Repo X-Ray overlay. null = no active scan (normal appearance). When set,
  // detected nodes get a status ring (domain color/size preserved) and the rest dim.
  scanStatusByNode?: Map<string, DetectionStatus> | null;
  scanHighlightEdges?: Set<string> | null;
  // Contextual edges (exactly one detected endpoint) — rendered faintly (UI-A).
  scanContextEdges?: Set<string> | null;
  // "Focus Stack": a bounds + nonce to frame the detected region. Bumping the nonce
  // re-triggers the fit (so the button works repeatedly).
  fitSignal?: { ids: string[]; nonce: number; sidebarWidthPx?: number } | null;
  // Stack View (X-Ray UX correction): temporary per-node render positions that reproject
  // detected nodes into domain clusters. null = Universe View (canonical coordinates).
  // Applied as a VIEW-LEVEL projection; canonical x/y are saved and restored on exit and
  // are never mutated in the dataset.
  stackPositions?: Map<string, { x: number; y: number }> | null;
  // Stack View domain cluster headings (a handful): graph-space anchor + label + color.
  // Rendered as a small DOM overlay projected to screen coords (not per-node WebGL labels).
  stackHeadings?: { domainId: string; label: string; color: string; x: number; y: number }[] | null;
  // Explore "Home" reframe: bump this nonce to smoothly re-fit the default atlas camera
  // (used when returning from Repo X-Ray so the homepage camera is fully restored).
  exploreNonce?: number;
  // Top-level domain metadata (id/name/color) for the Explore sector backplates + legend
  // sync. Only used to DRAW the atmospheric overlay — never alters graph data.
  domains?: { id: string; name: string; color: string; node_count: number }[] | null;
}

// Explore state: the selected node's neighborhood is prominent; everything else recedes.
const DIM_NODE = "rgba(120,130,150,0.12)";
const STRUCTURE_EDGE = "rgba(194,218,255,0.94)";
const LOCAL_EDGE = "rgba(100,194,255,0.88)";
const CROSS_EDGE = "rgba(255,194,104,0.96)";

// Repo X-Ray detection-status ring colors (spec §5: a SEPARATE visual channel from the
// node's domain color). confirmed=green, declared=blue, inferred=amber, related=neutral.
const STATUS_RING: Record<DetectionStatus, string> = {
  confirmed: "#4ade80",
  declared: "#60a5fa",
  inferred: "#fbbf24",
  related: "#c0caf5",
};
// Repo X-Ray state: detected nodes at full opacity; unrelated nodes fade to 0.10-0.20;
// verified edges (both endpoints detected) prominent; contextual (one endpoint) faint;
// unrelated edges nearly invisible so the detected stack reads in seconds (UI-A R3).
const SCAN_DIM_NODE = "rgba(110,120,140,0.11)";        // 0.10-0.20 unrelated node (low end)
const SCAN_HILITE_EDGE = "rgba(190,205,255,0.7)";      // 0.60-0.80 verified-between
const SCAN_CONTEXT_EDGE = "rgba(150,165,205,0.20)";    // 0.15-0.30 contextual
// Unrelated edges are the overwhelming majority (hundreds); even a tiny alpha accumulates
// into a visible web where they overlap, so they are effectively hidden (UI-A R3.3).
const SCAN_DIM_EDGE = "rgba(120,130,150,0.0)";

/**
 * The primary WebGL visualization. Owns the Sigma instance imperatively; React only
 * drives it through props. Sigma is kept out of React's render loop so interactions
 * never recreate the renderer (spec §15).
 *
 * Performance (smoothness plan, Tasks 7-9):
 *  - the active node's neighbor set is computed ONCE per hover/selection change, not
 *    per-node per-frame, avoiding O(n^2) work in the reducers;
 *  - enter/leave events coalesce into a single requestAnimationFrame refresh;
 *  - label/edge visibility follows the camera ratio (semantic zoom);
 *  - camera animations cancel any in-flight animation before starting a new one.
 */
// Frame the Stack View on its clustered nodes by handing Sigma a CUSTOM BOUNDING BOX in
// graph-coordinate space and resetting the camera to fit it. All math stays in graph units;
// Sigma converts to camera space internally, so there is no coordinate-system mixing and no
// hardcoded pixel offsets. Framing is correct at any screen size. The right side of the box
// is padded by the sidebar's *fraction of the viewport* so the clusters sit in the visible
// area left of the open panel. Caller clears the custom bbox (setCustomBBox(null)) on exit.
function fitStack(
  renderer: Sigma,
  positions: { x: number; y: number }[],
  prefersReduced: boolean,
): void {
  if (positions.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const gw = Math.max(maxX - minX, 1);
  const gh = Math.max(maxY - minY, 1);

  // Label-safe margin in graph units (headings sit above; labels extend sideways). Scale
  // the margin to the stack size so small stacks are not over-zoomed into a few huge dots.
  const marginX = Math.max(gw * 0.16, 220);
  const marginYtop = Math.max(gh * 0.16, 200);
  const marginYbot = Math.max(gh * 0.12, 140);
  let bMinX = minX - marginX;
  let bMaxX = maxX + marginX;
  let bMinY = minY - marginYtop;
  let bMaxY = maxY + marginYbot;

  const el = renderer.getContainer();
  const vw = el.clientWidth || window.innerWidth;
  const vh = el.clientHeight || window.innerHeight;
  const narrow = vw < 820;

  // Enforce a MINIMUM framed span (canonical units) on wide screens so a tiny stack is not
  // magnified until a few nodes fill the screen and the gaps look vast. Skipped on narrow
  // (mobile) viewports where the usable band is small.
  if (!narrow) {
    const MIN_W = 1700, MIN_H = 1300;
    const cxB = (bMinX + bMaxX) / 2, cyB = (bMinY + bMaxY) / 2;
    if (bMaxX - bMinX < MIN_W) { bMinX = cxB - MIN_W / 2; bMaxX = cxB + MIN_W / 2; }
    if (bMaxY - bMinY < MIN_H) { bMinY = cyB - MIN_H / 2; bMaxY = cyB + MIN_H / 2; }
  }

  // Compute the USABLE viewport rectangle (pixels) = the container minus the OPEN panel.
  // The panel is a right rail on wide screens but a full-width BOTTOM SHEET on mobile. We
  // frame the content into this rectangle directly (measure + nudge), rather than padding
  // the bbox asymmetrically, so it is correct in both orientations at any size.
  const panel = document.querySelector(".details, .xray-panel") as HTMLElement | null;
  const prect = panel ? panel.getBoundingClientRect() : null;
  const crect = el.getBoundingClientRect();
  const uLeft = 0, uTop = 0;
  let uRight = vw, uBottom = vh;
  if (prect && prect.width > 0 && prect.height > 0) {
    const isBottomSheet = prect.width >= vw * 0.85;
    if (isBottomSheet) {
      // sheet occupies the bottom; usable band is above its top edge.
      uBottom = Math.max(uTop + 120, prect.top - crect.top - 12);
    } else {
      // right rail; usable band is left of its left edge.
      uRight = Math.max(uLeft + 160, prect.left - crect.left - 12);
    }
  }
  const usableW = Math.max(120, uRight - uLeft);
  const usableH = Math.max(120, uBottom - uTop);

  // Construct an EXTENDED bbox that, when Sigma maps it to the full container, places the
  // content bounds exactly onto the usable rectangle. Sigma fits a custom bbox to the
  // container by the CONSTRAINING axis (letterboxing the other), so we use a single uniform
  // graph-units-per-pixel for both axes, then expand the content bounds outward by the
  // margins between the usable rect and the container edges. No camera-space math, no
  // hardcoded offsets — purely graph-space, correct for right-rail and bottom-sheet alike.
  const gpx = Math.max(
    (bMaxX - bMinX) / usableW,
    (bMaxY - bMinY) / usableH,
  );
  // Re-center content so the uniform gpx keeps it centered in the usable rect first.
  const contentCX = (bMinX + bMaxX) / 2;
  const contentCY = (bMinY + bMaxY) / 2;
  const halfUsableWg = (usableW / 2) * gpx;
  const halfUsableHg = (usableH / 2) * gpx;
  // Usable-rect edges in graph units (content centered in the usable rect):
  const uMinXg = contentCX - halfUsableWg;
  const uMaxXg = contentCX + halfUsableWg;
  // NOTE: viewport Y grows downward; graph Y grows upward. Top of usable rect = max graph Y.
  const uMinYg = contentCY - halfUsableHg; // bottom of usable rect (graph)
  const uMaxYg = contentCY + halfUsableHg; // top of usable rect (graph)

  // Extend to the full container: add the px margins (container edge to usable edge) * gpx.
  const fullMinX = uMinXg - uLeft * gpx;
  const fullMaxX = uMaxXg + (vw - uRight) * gpx;
  // top margin (uTop px) is above the usable rect -> larger graph Y; bottom margin below.
  const fullMaxY = uMaxYg + uTop * gpx;
  const fullMinY = uMinYg - (vh - uBottom) * gpx;

  renderer.setCustomBBox({ x: [fullMinX, fullMaxX], y: [fullMinY, fullMaxY] });
  renderer.refresh();
  // animatedReset frames the (extended) bbox: content lands on the usable rectangle.
  void renderer.getCamera().animatedReset({ duration: prefersReduced ? 0 : 650 });
}
// Sidebar-aware Explore framing: optically centre the FULL atlas in the usable canvas
// (viewport minus the left legend + right filter side-rails on wide screens; symmetric on
// mobile where panels are bottom sheets). Pure geometry, deterministic, no hardcoded offsets.
function fitExplore(renderer: Sigma, prefersReduced: boolean): void {
  const graph = renderer.getGraph();
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity, any = false;
  // Frame the full radial atlas, including every canonical node.
  graph.forEachNode((_n, a) => {
    const x = a.x as number, y = a.y as number;
    if (typeof x !== "number" || typeof y !== "number") return;
    any = true;
    mnX = Math.min(mnX, x); mnY = Math.min(mnY, y);
    mxX = Math.max(mxX, x); mxY = Math.max(mxY, y);
  });
  if (!any) return;
  const el = renderer.getContainer();
  const vw = el.clientWidth || window.innerWidth;
  // Narrow screens get extra padding so domain labels near the rim are not clipped by the
  // viewport edge (labels extend well beyond their node); wide screens use a tight frame.
  // Every canonical node stays visible at overview. A tighter mobile frame keeps the
  // clusters large enough to explore while leaving room for rim labels.
  const padFrac = vw < 641 ? 0.1 : 0.06;
  const padX = (mxX - mnX) * padFrac + 40;
  const padY = (mxY - mnY) * padFrac + 40;
  mnX -= padX; mxX += padX; mnY -= padY; mxY += padY;
  const vh = el.clientHeight || window.innerHeight;
  const cr = el.getBoundingClientRect();
  const gpx = Math.max((mxX - mnX) / Math.max(vw, 1), (mxY - mnY) / Math.max(vh, 1));
  let leftW = 0, rightW = 0;
  if (vw >= 641) {
    const q = (sel: string) => {
      const n = document.querySelector(sel) as HTMLElement | null;
      const r = n ? n.getBoundingClientRect() : null;
      return r && r.width > 0 && r.width < vw * 0.6 ? r : null;  // ignore bottom sheets
    };
    const legend = q(".legend");
    const filters = q("#graph-filters, .filter-panel");
    for (const panel of [legend, filters]) {
      if (!panel) continue;
      if (panel.left - cr.left < vw / 2) leftW = Math.max(leftW, panel.right - cr.left);
      else rightW = Math.max(rightW, cr.right - panel.left);
    }
  }
  const bMinX = mnX - leftW * gpx;
  const bMaxX = mxX + rightW * gpx;
  renderer.setCustomBBox({ x: [bMinX, bMaxX], y: [mnY, mxY] });
  if (prefersReduced) {
    renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    renderer.refresh();
  } else {
    void renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 500 });
  }
}

export function GraphCanvas({
  data,
  selectedId,
  selectedEdgeId = null,
  previewEdgeId = null,
  focusId,
  onSelect,
  onSelectEdge,
  visibleNodes = null,
  visibleEdges = null,
  scanStatusByNode = null,
  scanHighlightEdges = null,
  scanContextEdges = null,
  fitSignal = null,
  stackPositions = null,
  stackHeadings = null,
  exploreNonce = 0,
  domains = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  const selectedEdgeRef = useRef<string | null>(selectedEdgeId);
  const previewEdgeRef = useRef<string | null>(previewEdgeId);
  const keyboardIndexRef = useRef(-1);
  const [keyboardDomain, setKeyboardDomain] = useState("");
  // Precomputed highlight set for the current active node (Task 7).
  const activeRef = useRef<string | null>(null);
  const neighborSetRef = useRef<Set<string> | null>(null);
  // Live filter visibility sets, read inside the reducers (Phase 1B).
  const visibleNodesRef = useRef<Set<string> | null>(visibleNodes);
  const visibleEdgesRef = useRef<Set<string> | null>(visibleEdges);
  // Repo X-Ray overlay sets, read inside the reducers (Phase 1.5B).
  const scanStatusRef = useRef<Map<string, DetectionStatus> | null>(scanStatusByNode);
  const scanEdgesRef = useRef<Set<string> | null>(scanHighlightEdges);
  const scanContextRef = useRef<Set<string> | null>(scanContextEdges);
  // Persistent detected-node labels (UI-A): recomputed only when the overlay changes.
  const persistentLabelsRef = useRef<Set<string> | null>(null);
  // Saved canonical coordinates while Stack View is active (restored on exit).
  const savedCoordsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const focusBBoxRef = useRef(false);
  const stackAnimRef = useRef<number | null>(null);
  const stackActiveRef = useRef<boolean>(false);
  const framedStackRef = useRef<number | null>(null);
  const stackPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const stackHeadingsRef = useRef<{ x: number; y: number }[] | null>(null);
  // rAF coalescing for refreshes (Task 7).
  const rafRef = useRef<number | null>(null);
  // Exposes the build-effect's coalesced refresh to the selection/filter effects,
  // so a selection change from search/legend/deep-link/panel recomputes the highlight
  // set (not just a bare renderer.refresh()).
  const scheduleRefreshRef = useRef<(() => void) | null>(null);
  const ratioRef = useRef<number>(1);
  const recomputeLabelsRef = useRef<(() => void) | null>(null);
  const suppressedLabelsRef = useRef<Set<string>>(new Set());
  // Projected screen positions for Stack View domain headings (DOM overlay).
  const [headingScreens, setHeadingScreens] = useState<
    { domainId: string; label: string; color: string; left: number; top: number; visible: boolean }[]
  >([]);

  // Explore atlas overlay: soft domain-sector backplates, projected
  // to screen coords and kept in sync with the camera. Purely decorative (pointer-events
  // none); never touches graph data. Each sector is centered on its domain anchor.
  const [backdrop, setBackdrop] = useState<{
    sectors: { id: string; color: string; cx: number; cy: number; r: number }[];
    center: { cx: number; cy: number; r: number } | null;
  }>({ sectors: [], center: null });
  const domainGeomRef = useRef<Map<string, { gx: number; gy: number; gr: number }> | null>(null);
  const domainsRef = useRef(domains);
  domainsRef.current = domains;

  // Build the Sigma instance once per dataset.
  useEffect(() => {
    if (!containerRef.current) return;
    const graph = buildGraph(data);
    const overviewEdges = selectClearEdges(data, 8, 120, false, 14);
    const detailEdges = selectClearEdges(data, 12, 150, true, 10);
    graphRef.current = graph;

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: "curved",
      edgeProgramClasses: { curved: EdgeCurveProgram },
      enableEdgeEvents: true,
      labelColor: { color: "#c8d0e8" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      // UI-C: reduce Universe label collisions. Larger grid cells + lower density mean
      // fewer labels compete per screen region; the rendered-size threshold suppresses
      // labels for small nodes until the user zooms in (semantic zoom still applies on top).
      // On NARROW (mobile) viewports collisions are worse, so use larger cells + lower
      // density: Sigma then renders fewer labels per region and picks the LARGEST node in
      // each cell, which is the domain anchor — so top-level domain labels win and small
      // colliding labels are dropped (redesign §3). More labels return on zoom.
      labelDensity: (typeof window !== "undefined" && window.innerWidth < 641) ? 0.3 : 0.5,
      labelGridCellSize: (typeof window !== "undefined" && window.innerWidth < 641) ? 260 : 110,
      zIndex: true,
      minCameraRatio: 0.08,
      maxCameraRatio: 2.5,
      // "bordered" node type = fill (domain color) + an outer ring (detection status).
      // The default "circle" program is kept for normal (non-scan) rendering.
      nodeProgramClasses: {
        bordered: createNodeBorderProgram({
          borders: [
            { size: { attribute: "borderSize", defaultValue: 0 },
              color: { attribute: "borderColor", defaultValue: "#000000" } },
            { size: { fill: true }, color: { attribute: "color" } },
          ],
        }),
      },
    });
    sigmaRef.current = renderer;

    // Sidebar-aware INITIAL framing (Explore redesign §11): optically centre the atlas in
    // the USABLE canvas (viewport minus the left legend + right filter panels), not the raw
    // viewport, so no domain sector hides behind a panel. Done once on mount by framing a
    // custom bbox whose L/R margins mirror the measured panel widths. Pure geometry, no
    // hardcoded offsets; skipped when a scan (Stack View) owns the camera.
    requestAnimationFrame(() => {
      if (stackActiveRef.current) return;
      fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    });

    // Test-only renderer handle, compiled in ONLY when VITE_TEST_HOOKS is set at build
    // time (the e2e harness build). It is tree-shaken out of the production deploy build,
    // so no internal renderer reference is ever exposed to shipped users.
    if (import.meta.env.VITE_TEST_HOOKS === "true" && typeof window !== "undefined") {
      (window as unknown as { __ta_sigma?: unknown }).__ta_sigma = renderer;
    }

    // Compute the highlight set once whenever the active node changes.
    const recomputeActive = () => {
      let active = selectedRef.current ?? hoveredRef.current;
      // If a filter currently hides the active node, don't treat it as active —
      // otherwise every visible node outside its neighbor set gets dimmed and the
      // graph looks blanked (requirement: handle selection hidden by filtering).
      const vis = visibleNodesRef.current;
      if (active && vis && !vis.has(active)) active = null;
      if (active === activeRef.current) return;
      activeRef.current = active;
      if (!active || !graph.hasNode(active)) {
        neighborSetRef.current = null;
        return;
      }
      const set = new Set<string>([active]);
      const nodeType = graph.getNodeAttribute(active, "nodeType");
      if (nodeType === "domain") {
        for (const id of domainMemberIds(graph, active)) set.add(id);
      } else {
        graph.forEachNeighbor(active, (nb) => set.add(nb));
      }
      neighborSetRef.current = set;
    };

    // Coalesced refresh: at most one per animation frame (Task 7).
    const scheduleRefresh = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recomputeActive();
        renderer.refresh();
      });
    };
    scheduleRefreshRef.current = scheduleRefresh;
    const recomputeOverviewLabels = () => {
      const previous = suppressedLabelsRef.current;
      if (scanStatusRef.current || activeRef.current || selectedEdgeRef.current || bandOf(ratioRef.current) > 1) {
        if (previous.size) { suppressedLabelsRef.current = new Set(); renderer.refresh(); }
        return;
      }
      const el = renderer.getContainer();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = "12px Inter, system-ui, sans-serif";
      const nodeBoxes: { key: string; x: number; y: number; w: number; h: number }[] = [];
      const candidates: { id: string; priority: number; ownerKey: string; box: { x: number; y: number; w: number; h: number } }[] = [];
      graph.forEachNode((id, attrs) => {
        const display = renderer.getNodeDisplayData(id);
        if (!display || display.hidden) return;
        const point = renderer.graphToViewport({ x: attrs.x as number, y: attrs.y as number });
        const radius = renderer.scaleSize(display.size);
        if (attrs.nodeType === "domain" || (el.clientWidth >= 641 && (attrs.ring as number) === 1 && (attrs.size as number) > 10)) {
          nodeBoxes.push({ key: id, x: point.x - radius, y: point.y - radius, w: radius * 2, h: radius * 2 });
        }
        if (attrs.nodeType !== "domain" || attrs.ring !== 0) return;
        const label = attrs.label as string;
        candidates.push({
          id, ownerKey: id,
          priority: domainsRef.current?.find((domain) => domain.id === id)?.node_count ?? 0,
          box: { x: point.x + radius + 2, y: point.y - 7,
            w: Math.max(ctx.measureText(label).width, label.length * 6.8) + 4, h: 14 },
        });
      });
      const containerRect = el.getBoundingClientRect();
      const panels = [".legend", "#graph-filters", ".filter-panel", ".relationship-legend"]
        .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => !!rect && rect.width > 0 && rect.height > 0)
        .map((rect) => ({ x: rect.left - containerRect.left, y: rect.top - containerRect.top,
          w: rect.width, h: rect.height }));
      const suppressed = placeLabels({ candidates, nodeBoxes, panels,
        viewport: { w: el.clientWidth, h: el.clientHeight } });
      if (previous.size !== suppressed.size || [...previous].some((id) => !suppressed.has(id))) {
        suppressedLabelsRef.current = suppressed;
        renderer.refresh();
      }
    };
    recomputeLabelsRef.current = recomputeOverviewLabels;

    // Which nodes may show labels at the current zoom (Task 8) — pure logic imported
    // from semanticZoom.ts and fed the live camera ratio. On NARROW (mobile) viewports the
    // overview band shows ONLY top-level domain labels (redesign §3): even the large hubs
    // are suppressed until the user zooms in, so domain names never fight each other for
    // space. Sigma's enlarged collision grid then drops any domain labels that still touch.
    const labelVisible = (nodeType: string, size: number): boolean => {
      if (bandOf(ratioRef.current) <= 1) return nodeType === "domain";
      return labelVisibleAtRatio(nodeType as never, size, ratioRef.current);
    };

    renderer.setSetting("nodeReducer", (node, dataIn) => {
      const active = activeRef.current;
      const res: Record<string, unknown> = { ...dataIn };

      // Phase 1B filter: hide nodes outside the visible set. This composes with
      // semantic zoom by logical AND — a node shows only if the filter allows it
      // AND the zoom level would show it. Coordinates are untouched.
      const vis = visibleNodesRef.current;
      if (vis && !vis.has(node)) {
        res.hidden = true;
        return res;
      }

      // Repo X-Ray overlay (Phase 1.5B): detected nodes keep their domain color and
      // size but gain a status-colored ring; everything else dims. This is applied
      // before the hover/selection highlight so a scan read is stable.
      const scan = scanStatusRef.current;
      if (scan) {
        const status = scan.get(node);
        if (status) {
          res.type = "bordered";
          res.borderColor = STATUS_RING[status];
          res.borderSize = 3;
          res.zIndex = 2;
          // keep domain color (res.color unchanged) and size; show a PERSISTENT label for
          // this detected node when it's in the budgeted set, or when hovered/active, so the
          // scanned stack is identifiable without the sidebar (UI-A R5).
          const persist = persistentLabelsRef.current;
          const labelled =
            node === active || node === hoveredRef.current || (persist?.has(node) ?? false);
          if (labelled) {
            // Bypass Sigma's global label-collision for the budgeted detected set so the
            // scanned stack stays identifiable (UI-A R5) even under the tighter Universe
            // label density used for collision control (UI-C).
            res.forceLabel = true;
          } else {
            res.label = "";
          }
          return res;
        }
        // not detected -> in Stack View hide entirely so detected clusters read cleanly;
        // in Universe View (scan overlay) fade into the background.
        if (stackActiveRef.current) {
          res.hidden = true;
          return res;
        }
        res.color = SCAN_DIM_NODE;
        res.label = "";
        res.zIndex = 0;
        return res;
      }

      const selectedEdge = selectedEdgeRef.current;
      if (selectedEdge && graph.hasEdge(selectedEdge)) {
        const [source, target] = graph.extremities(selectedEdge);
        if (node === source || node === target) {
          res.label = dataIn.label;
          res.highlighted = true;
          res.zIndex = 2;
        } else {
          res.color = DIM_NODE;
          res.label = "";
          res.size = Math.min(dataIn.size as number, 2.2);
        }
        return res;
      }

      // Semantic-zoom label gating.
      if (!labelVisible(dataIn.nodeType as string, dataIn.size as number)) {
        res.label = "";
      }

      if (!active) {
        const ring = (dataIn.ring as number | undefined) ?? 0;
        const isDomain = dataIn.nodeType === "domain";
        res.zIndex = isDomain ? 2 : ring === 1 ? 1 : 0;
        if (bandOf(ratioRef.current) <= 1) {
          const base = dataIn.size as number;
          res.size = isDomain ? Math.min(base, 8.5)
            : ring === 1 ? Math.min(base, 3.6)
            : ring === 2 ? Math.min(base, 2.5) : Math.min(base, 2);
          if (isDomain && ring > 0) res.label = "";
          if (suppressedLabelsRef.current.has(node)) res.label = "";
        }
        if (!isDomain && ring > 0 && typeof dataIn.color === "string" && /^#[0-9a-f]{6}$/i.test(dataIn.color)) {
          const hex = dataIn.color;
          const alpha = ring === 1 ? 0.9 : ring === 2 ? 0.75 : 0.5;
          res.color = `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`;
        }
        return res;
      }
      const set = neighborSetRef.current;
      if (set && set.has(node)) {
        if (node === active) {
          res.zIndex = 2;
          res.highlighted = true;
          res.label = dataIn.label; // always label the active node
        } else {
          const ring = (dataIn.ring as number | undefined) ?? 2;
          res.size = Math.min(dataIn.size as number, ring === 1 ? 8 : 6);
        }
        return res;
      }
      res.color = DIM_NODE;
      res.label = "";
      res.size = Math.min(dataIn.size as number, 2.2);
      res.zIndex = 0;
      return res;
    });

    renderer.setSetting("edgeReducer", (edge, dataIn) => {
      // Phase 1B filter: hide edges whose endpoints aren't both visible.
      const vedges = visibleEdgesRef.current;
      if (vedges && !vedges.has(edge)) {
        return { ...dataIn, hidden: true };
      }
      const shownEdge = selectedEdgeRef.current ?? previewEdgeRef.current;
      if (shownEdge) {
        if (edge !== shownEdge) return { ...dataIn, hidden: true };
        const [source, target] = graph.extremities(edge);
        const cross = graph.getNodeAttribute(source, "primaryDomain") !== graph.getNodeAttribute(target, "primaryDomain");
        return { ...dataIn, color: cross ? "rgba(251,191,36,0.95)" : "rgba(150,180,255,0.9)",
          size: 2.4, zIndex: 4, curvature: 0.04 };
      }
      // Repo X-Ray overlay: highlight only existing edges between two detected nodes.
      const scanEdges = scanEdgesRef.current;
      if (scanEdges) {
        if (stackActiveRef.current) {
          // Stack View default: suppress edges so domain grouping is not mistaken for a
          // dependency (spec SS3). BUT when a node is SELECTED, reveal only its VERIFIED
          // canonical edges to other detected nodes (spec SS2) — never co-occurrence edges.
          return { ...dataIn, hidden: true };
        }
        if (activeRef.current || !detailEdges.has(edge)) return { ...dataIn, hidden: true };
        if (scanEdges.has(edge)) return { ...dataIn, color: SCAN_HILITE_EDGE, size: 1.5, zIndex: 2, curvature: 0.04 };
        if (scanContextRef.current?.has(edge)) return { ...dataIn, color: SCAN_CONTEXT_EDGE, size: 0.7, zIndex: 1, curvature: 0.04 };
        // Unrelated edges: hide outright. They are the majority and only add noise in a
        // scan read; hiding (not just alpha~0) also saves overdraw (perf R30).
        return { ...dataIn, hidden: true, color: SCAN_DIM_EDGE, zIndex: 0 };
      }
      const active = activeRef.current;
      if (!active) {
        const [source, target] = graph.extremities(edge);
        const cross = graph.getNodeAttribute(source, "primaryDomain") !== graph.getNodeAttribute(target, "primaryDomain");
        const relation = graph.getEdgeAttribute(edge, "relationshipType");
        const structural = relation === "belongs_to_domain" || relation === "has_subdomain";
        const color = cross ? CROSS_EDGE : structural ? STRUCTURE_EDGE : LOCAL_EDGE;
        if (bandOf(ratioRef.current) <= 1) {
          if (!overviewEdges.has(edge)) return { ...dataIn, hidden: true };
          return { ...dataIn, color, size: cross ? 2.2 : 1.9, curvature: 0.04 };
        }
        return detailEdges.has(edge)
          ? { ...dataIn, color, size: 1.35, curvature: 0.04 }
          : { ...dataIn, hidden: true };
      }
      return { ...dataIn, hidden: true };
    });

    renderer.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      scheduleRefresh();
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hoveredRef.current = null;
      scheduleRefresh();
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });
    renderer.on("clickNode", ({ node }) => {
      onSelect(node);
    });
    renderer.on("clickEdge", ({ edge }) => onSelectEdge?.(edge));
    renderer.on("clickStage", ({ event }) => {
      let nearEdge: string | null = null, bestEdgeDistance = 5;
      if (onSelectEdge) graph.forEachEdge((id, _attrs, source, target) => {
        if (renderer.getEdgeDisplayData(id)?.hidden) return;
        const a = renderer.graphToViewport(graph.getNodeAttributes(source) as { x: number; y: number });
        const b = renderer.graphToViewport(graph.getNodeAttributes(target) as { x: number; y: number });
        const c = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.04,
          y: (a.y + b.y) / 2 - (b.x - a.x) * 0.04 };
        let previous = a;
        for (let i = 1; i <= 16; i++) {
          const t = i / 16, u = 1 - t;
          const next = { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
            y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
          const dx = next.x - previous.x, dy = next.y - previous.y;
          const v = Math.max(0, Math.min(1, ((event.x - previous.x) * dx + (event.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
          const distance = Math.hypot(event.x - previous.x - v * dx, event.y - previous.y - v * dy);
          if (distance < bestEdgeDistance) { bestEdgeDistance = distance; nearEdge = id; }
          previous = next;
        }
      });
      if (nearEdge && onSelectEdge) { onSelectEdge(nearEdge); return; }
      if (containerRef.current && containerRef.current.clientWidth < 641) {
        let nearest: string | null = null;
        let best = 18;
        graph.forEachNode((id, attrs) => {
          const display = renderer.getNodeDisplayData(id);
          if (!display || display.hidden) return;
          const point = renderer.graphToViewport({ x: attrs.x as number, y: attrs.y as number });
          const distance = Math.hypot(point.x - event.x, point.y - event.y);
          if (distance < best) { best = distance; nearest = id; }
        });
        if (nearest) { onSelect(nearest); return; }
      }
      onSelect(null);
    });

    // Re-gate labels when the zoom level crosses a threshold (Task 8).
    const camera = renderer.getCamera();
    let labelTimer: ReturnType<typeof setTimeout> | null = null;
    const onCameraUpdate = () => {
      const r = camera.getState().ratio;
      const crossed =
        bandOf(r) !== bandOf(ratioRef.current); // refresh on band change
      ratioRef.current = r;
      if (crossed) scheduleRefresh();
      if (labelTimer) clearTimeout(labelTimer);
      labelTimer = setTimeout(recomputeOverviewLabels, 150);
    };
    camera.on("updated", onCameraUpdate);
    ratioRef.current = camera.getState().ratio;

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      camera.removeListener("updated", onCameraUpdate);
      if (labelTimer) clearTimeout(labelTimer);
      renderer.kill();
      sigmaRef.current = null;
      graphRef.current = null;
      activeRef.current = null;
      neighborSetRef.current = null;
    };
  }, [data, onSelect, onSelectEdge]);

  // React to selection changes (recompute happens inside the scheduled refresh).
  useEffect(() => {
    selectedRef.current = selectedId;
    // Recompute the highlight set (not just a bare refresh) so selections coming
    // from search, the legend, a deep link, or the detail panel update the graph.
    scheduleRefreshRef.current?.();
  }, [selectedId]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdgeId;
    scheduleRefreshRef.current?.();
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!selectedEdgeId || !renderer || !graph?.hasEdge(selectedEdgeId)) return;
    const [source, target] = graph.extremities(selectedEdgeId);
    const a = renderer.getNodeDisplayData(source);
    const b = renderer.getNodeDisplayData(target);
    if (!a || !b) return;
    const narrow = renderer.getContainer().clientWidth < 641;
    renderer.getCamera().animate({
      x: (a.x + b.x) / 2 + (narrow ? 0 : 0.14),
      y: (a.y + b.y) / 2 - (narrow ? 0.12 : 0),
      ratio: narrow ? 0.7 : 0.45,
    }, { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450 });
  }, [selectedEdgeId]);

  useEffect(() => {
    previewEdgeRef.current = previewEdgeId;
    scheduleRefreshRef.current?.();
  }, [previewEdgeId]);

  // React to filter changes: update the live sets the reducers read, then refresh.
  // We never rebuild the graph or touch coordinates (requirement 1.7).
  useEffect(() => {
    visibleNodesRef.current = visibleNodes;
    visibleEdgesRef.current = visibleEdges;
    // Recompute active too: a filter may have just hidden the selected node.
    scheduleRefreshRef.current?.();
  }, [visibleNodes, visibleEdges]);

  // React to Repo X-Ray overlay changes: update the live sets the reducers read, then
  // refresh. Clearing them (scan exit) restores normal styling. Never mutates the graph.
  useEffect(() => {
    scanStatusRef.current = scanStatusByNode;
    scanEdgesRef.current = scanHighlightEdges;
    scanContextRef.current = scanContextEdges;
    // Recompute the budgeted persistent-label set once per overlay change (never per
    // frame — performance R30.4). Uses the graph's render sizes as the popularity proxy.
    const graph = graphRef.current;
    if (scanStatusByNode && graph) {
      const sizeById = new Map<string, number>();
      for (const id of scanStatusByNode.keys()) {
        if (graph.hasNode(id)) sizeById.set(id, graph.getNodeAttribute(id, "size") as number);
      }
      const ctx: LabelContext = {
        selectedId: selectedRef.current,
        hoveredId: hoveredRef.current,
        statusByNode: scanStatusByNode,
        sizeById,
      };
      // Label prioritization: on narrow (mobile) viewports show only the top few
      // persistent labels so clusters stay readable; selection/hover/zoom reveal more
      // (those bypass the budget in the node reducer). Desktop keeps the full budget.
      const vw = containerRef.current?.clientWidth ?? window.innerWidth;
      const labelBudget = vw < 760 ? 8 : vw < 1024 ? 16 : undefined;
      persistentLabelsRef.current = selectPersistentLabels(
        scanStatusByNode.keys(), ctx, labelBudget,
      );
    } else {
      persistentLabelsRef.current = null;
    }
    const renderer = sigmaRef.current;
    if (renderer) renderer.refresh();
  }, [scanStatusByNode, scanHighlightEdges, scanContextEdges]);

  // Stack View projection (X-Ray UX correction). Reprojects detected nodes into domain
  // clusters via temporary coordinates, with smooth eased repositioning; restores the
  // canonical coordinates on exit. Never mutates the dataset. Non-detected nodes are left
  // to the reducer (already dimmed/hidden under the scan overlay). prefers-reduced-motion
  // skips the animation and snaps to final positions.
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Cancel any running projection animation.
    if (stackAnimRef.current !== null) {
      cancelAnimationFrame(stackAnimRef.current);
      stackAnimRef.current = null;
    }
    if (framedStackRef.current !== null) {
      cancelAnimationFrame(framedStackRef.current);
      framedStackRef.current = null;
    }

    stackActiveRef.current = !!(stackPositions && stackPositions.size > 0);
    stackPositionsRef.current = stackPositions ?? null;
    stackHeadingsRef.current = stackHeadings?.map((h) => ({ x: h.x, y: h.y })) ?? null;
    if (stackPositions && stackPositions.size > 0) {
      // Save canonical coordinates once (first entry into Stack View).
      if (!savedCoordsRef.current) {
        const saved = new Map<string, { x: number; y: number }>();
        graph.forEachNode((id, a) => saved.set(id, { x: a.x as number, y: a.y as number }));
        savedCoordsRef.current = saved;
      }
      const starts = new Map<string, { x: number; y: number }>();
      for (const [id] of stackPositions) {
        if (graph.hasNode(id)) {
          starts.set(id, {
            x: graph.getNodeAttribute(id, "x") as number,
            y: graph.getNodeAttribute(id, "y") as number,
          });
        }
      }
      const apply = (t: number) => {
        for (const [id, target] of stackPositions) {
          if (!graph.hasNode(id)) continue;
          const s = starts.get(id)!;
          graph.setNodeAttribute(id, "x", s.x + (target.x - s.x) * t);
          graph.setNodeAttribute(id, "y", s.y + (target.y - s.y) * t);
        }
        renderer.refresh();
      };
      if (prefersReduced) { apply(1); return; }
      const dur = 600;
      const t0 = performance.now();
      const ease = (u: number) => 1 - Math.pow(1 - u, 3); // easeOutCubic
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / dur);
        apply(ease(u));
        if (u < 1) stackAnimRef.current = requestAnimationFrame(step);
        else stackAnimRef.current = null;
      };
      stackAnimRef.current = requestAnimationFrame(step);
      // Frame the camera on the reprojected stack bounds using Sigma's OWN coordinate
      // conversion (self-calibrating, not hardcoded), so clusters fit the USABLE viewport
      // (canvas width minus the open right sidebar + a label-safe margin) at any screen size.
      framedStackRef.current = requestAnimationFrame(() => {
        // Include heading anchors in the fit bounds so the topmost cluster label is
        // never clipped by the camera frame.
        const pts = [
          ...stackPositions.values(),
          ...(stackHeadings?.map((h) => ({ x: h.x, y: h.y })) ?? []),
        ];
        fitStack(renderer, pts, prefersReduced);
      });
    } else if (savedCoordsRef.current) {
      // Exit Stack View -> restore canonical coordinates (snap or eased).
      // Clear the custom bbox first so Sigma reframes the full canonical universe,
      // then reset the camera once coordinates are back home.
      renderer.setCustomBBox(null);
      const saved = savedCoordsRef.current;
      const starts = new Map<string, { x: number; y: number }>();
      graph.forEachNode((id, a) => starts.set(id, { x: a.x as number, y: a.y as number }));
      const apply = (t: number) => {
        for (const [id, target] of saved) {
          if (!graph.hasNode(id)) continue;
          const s = starts.get(id)!;
          graph.setNodeAttribute(id, "x", s.x + (target.x - s.x) * t);
          graph.setNodeAttribute(id, "y", s.y + (target.y - s.y) * t);
        }
        renderer.refresh();
      };
      if (prefersReduced) {
        apply(1); savedCoordsRef.current = null;
        void renderer.getCamera().animatedReset({ duration: 0 });
        return;
      }
      const dur = 500;
      const t0 = performance.now();
      const ease = (u: number) => 1 - Math.pow(1 - u, 3);
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / dur);
        apply(ease(u));
        if (u < 1) stackAnimRef.current = requestAnimationFrame(step);
        else {
          stackAnimRef.current = null; savedCoordsRef.current = null;
          void renderer.getCamera().animatedReset({ duration: 400 });
        }
      };
      stackAnimRef.current = requestAnimationFrame(step);
    }
  }, [stackPositions, stackHeadings]);

  // "Focus Stack" — frame the detected nodes' bounding region with padding, keeping
  // labels readable (never zoom so far the graph is unusable). Uses the precomputed
  // coordinates; never relayouts.
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !fitSignal || fitSignal.ids.length === 0) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // In Stack View the camera is framed by the custom bbox (fitStack); re-run that
    // same path so "Focus on Stack" stays consistent and never mixes coordinate spaces.
    if (stackActiveRef.current && stackPositionsRef.current) {
      const pts = [
        ...stackPositionsRef.current.values(),
        ...(stackHeadingsRef.current?.map((h) => ({ x: h.x, y: h.y })) ?? []),
      ];
      fitStack(renderer, pts, prefersReduced);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = 0;
    for (const id of fitSignal.ids) {
      if (!graph.hasNode(id)) continue;
      const x = graph.getNodeAttribute(id, "x") as number;
      const y = graph.getNodeAttribute(id, "y") as number;
      if (typeof x !== "number" || typeof y !== "number") continue;
      found++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (found === 0) return;
    const camera = renderer.getCamera();
    // Full node spread for normalization.
    let fullMinX = Infinity, fullMaxX = -Infinity, fullMinY = Infinity, fullMaxY = -Infinity;
    graph.forEachNode((_n, a) => {
      const x = a.x as number, y = a.y as number;
      fullMinX = Math.min(fullMinX, x); fullMaxX = Math.max(fullMaxX, x);
      fullMinY = Math.min(fullMinY, y); fullMaxY = Math.max(fullMaxY, y);
    });
    const fit = computeFit({
      bounds: { minX, minY, maxX, maxY },
      fullSpread: { minX: fullMinX, minY: fullMinY, maxX: fullMaxX, maxY: fullMaxY },
      sidebarWidthPx: fitSignal.sidebarWidthPx ?? 0,
      viewportWidthPx: containerRef.current?.clientWidth ?? window.innerWidth,
      minRatio: 0.12,
      universeRatio: 1.1,
      padding: 0.4,
    });
    if (!fit) return;
    camera.animate(
      { x: fit.x, y: fit.y, ratio: fit.ratio },
      { duration: prefersReduced ? 0 : 600 },
    );
  }, [fitSignal]);

  // Explore "Home" reframe (Repo X-Ray -> Explore): clear any Stack View custom bbox and
  // smoothly restore the default sidebar-aware atlas camera. Runs only when exploreNonce
  // changes (not on first mount, which the construction effect already frames).
  const exploreNonceRef = useRef(exploreNonce);
  useEffect(() => {
    if (exploreNonce === exploreNonceRef.current) return;
    exploreNonceRef.current = exploreNonce;
    const renderer = sigmaRef.current;
    if (!renderer) return;
    renderer.setCustomBBox(null);
    requestAnimationFrame(() => {
      fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    });
  }, [exploreNonce]);

  // Animate the camera to the focused node; cancel any in-flight animation (Task 9).
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;
    if (!focusId || !graph.hasNode(focusId)) {
      if (focusBBoxRef.current) {
        focusBBoxRef.current = false;
        renderer.setCustomBBox(null);
        fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
      return;
    }
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const display = renderer.getNodeDisplayData(focusId);
    if (!display) return;
    const camera = renderer.getCamera();
    const container = renderer.getContainer();
    const narrow = container.clientWidth < 641;
    const isDomain = graph.getNodeAttribute(focusId, "nodeType") === "domain";
    const ratio = narrow ? (isDomain ? 0.8 : 0.55) : 0.35;
    const targetX = display.x;
    const targetY = display.y;
    if (narrow) {
      // Frame the selected family into the usable band above the bottom sheet. Sigma
      // clamps camera movement to graph bounds, so fitting this local set avoids trying
      // to pan a full-atlas camera past those bounds.
      const focusNodes = new Set<string>([focusId]);
      if (isDomain) {
        graph.forEachNode((id, attrs) => {
          if (attrs.primaryDomain === focusId) focusNodes.add(id);
        });
      } else {
        for (const id of graph.neighbors(focusId)) focusNodes.add(id);
      }
      const positions = [...focusNodes]
        .filter((id) => graph.hasNode(id))
        .map((id) => ({
          x: graph.getNodeAttribute(id, "x") as number,
          y: graph.getNodeAttribute(id, "y") as number,
        }));
      fitStack(renderer, positions, prefersReducedMotion);
      focusBBoxRef.current = true;
      const sheet = document.querySelector(".details") as HTMLElement | null;
      const sheetTop = sheet
        ? sheet.getBoundingClientRect().top - container.getBoundingClientRect().top
        : container.clientHeight * 0.48;
      const desiredY = Math.max(52, (sheetTop - 20) / 2);
      const framed = renderer.getNodeDisplayData(focusId);
      const focusBBox = renderer.getCustomBBox();
      if (framed && focusBBox) {
        const desiredPoint = renderer.viewportToFramedGraph(
          { x: container.clientWidth / 2, y: desiredY },
          { cameraState: { x: 0.5, y: 0.5, ratio: 1, angle: 0 } },
        );
        const span = Math.max(
          focusBBox.x[1] - focusBBox.x[0],
          focusBBox.y[1] - focusBBox.y[0],
        );
        // Translate the focus frame itself. On portrait screens Sigma clamps a camera
        // pan against the local bbox; shifting the bbox keeps the requested screen target
        // reachable while preserving the family scale and shape.
        const shiftY = (desiredPoint.y - framed.y) * span;
        renderer.setCustomBBox({
          x: focusBBox.x,
          y: [focusBBox.y[0] - shiftY, focusBBox.y[1] - shiftY],
        });
        camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
        renderer.refresh();
      }
      return;
    }
    // starting a new animation implicitly supersedes the previous target; calling
    // animate again is safe, but we null-out the callback timer by not chaining.
    camera.animate(
      { x: targetX, y: targetY, ratio },
      { duration: prefersReducedMotion ? 0 : 500 },
    );
  }, [focusId]);

  // Project Stack View domain headings to screen coordinates and keep them in sync with
  // camera moves. A handful of headings only (one per domain) -> cheap DOM overlay, not a
  // per-node label flood (performance budget preserved).
  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    if (!stackHeadings || stackHeadings.length === 0) {
      setHeadingScreens([]);
      return;
    }
    const project = () => {
      const el = renderer.getContainer();
      const cw = el.clientWidth || window.innerWidth;
      const ch = el.clientHeight || window.innerHeight;
      // Usable band excludes the OPEN panel (right rail or bottom sheet). A heading is
      // hidden when it would land outside this band (off-screen or behind the panel) —
      // so on a tiny expanded-sheet preview we simplify by dropping labels rather than
      // overlapping them, without any extra state.
      const panel = document.querySelector(".details, .xray-panel") as HTMLElement | null;
      const pr = panel ? panel.getBoundingClientRect() : null;
      const cr = el.getBoundingClientRect();
      let bandRight = cw, bandBottom = ch;
      if (pr && pr.width > 0 && pr.height > 0) {
        if (pr.width >= cw * 0.85) bandBottom = Math.max(80, pr.top - cr.top - 8); // bottom sheet
        else bandRight = Math.max(120, pr.left - cr.left - 8); // right rail
      }
      const next = stackHeadings.map((h) => {
        const p = renderer.graphToViewport({ x: h.x, y: h.y });
        const visible = p.x > 4 && p.y > 4 && p.x < bandRight && p.y < bandBottom;
        return { domainId: h.domainId, label: h.label, color: h.color, left: p.x, top: p.y, visible };
      });
      setHeadingScreens(next);
    };
    project();
    const camera = renderer.getCamera();
    camera.on("updated", project);
    // The camera "updated" event can miss the final frame of an animatedReset (used by
    // fitStack) and of the collapse reframe, leaving headings projected from a stale
    // camera and visually detached from their clusters. Re-project on a short rAF loop
    // that spans the camera animation so headings track their clusters to the last frame.
    let rafId = 0;
    const start = performance.now();
    const loop = (now: number) => {
      project();
      if (now - start < 1200) rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => { camera.removeListener("updated", project); cancelAnimationFrame(rafId); };
    // Re-run (restart the rAF loop) whenever the stack reprojects or the camera is
    // reframed (fitSignal nonce changes, e.g. the mobile sheet collapse) so headings
    // re-sync even when fitStack uses setCustomBBox (which may not emit camera 'updated').
  }, [stackHeadings, stackPositions, fitSignal?.nonce]);

  // ---- Explore atlas backdrop: domain-sector backplates + centre identity ----
  // Decorative overlay only (pointer-events:none). Projects each domain's member-cluster
  // centroid/radius and the atlas centre to screen on every camera move, so the tinted
  // sectors and centre mark track pan/zoom without per-frame cost (recompute on 'updated').
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    // Compute graph-space geometry per TOP-LEVEL domain ONCE (deterministic from coords).
    // Members = nodes whose primaryDomain is the domain (same definition as the count).
    const doms = domainsRef.current;
    if (!doms || doms.length === 0) { setBackdrop({ sectors: [], center: null }); return; }
    if (!domainGeomRef.current) {
      const geom = new Map<string, { gx: number; gy: number; gr: number }>();
      for (const d of doms) {
        if (!graph.hasNode(d.id)) continue;
        const gx = graph.getNodeAttribute(d.id, "x") as number;
        const gy = graph.getNodeAttribute(d.id, "y") as number;
        let maxd = 0;
        graph.forEachNode((id, a) => {
          if (a.primaryDomain === d.id || id === d.id) {
            maxd = Math.max(maxd, Math.hypot((a.x as number) - gx, (a.y as number) - gy));
          }
        });
        geom.set(d.id, { gx, gy, gr: maxd * 1.08 + 40 });
      }
      domainGeomRef.current = geom;
    }

    const project = () => {
      // Suppress the atlas backdrop entirely during Repo X-Ray (Stack View owns the canvas).
      if (stackActiveRef.current) { setBackdrop({ sectors: [], center: null }); return; }
      const geom = domainGeomRef.current!;
      const colorOf = new Map(doms.map((d) => [d.id, d.color]));
      const sectors: { id: string; color: string; cx: number; cy: number; r: number }[] = [];
      let gcx = 0, gcy = 0, gn = 0;
      for (const [id, g] of geom) {
        const c = renderer.graphToViewport({ x: g.gx, y: g.gy });
        const edge = renderer.graphToViewport({ x: g.gx + g.gr, y: g.gy });
        const r = Math.hypot(edge.x - c.x, edge.y - c.y);
        sectors.push({ id, color: colorOf.get(id) ?? "#8a93ab", cx: c.x, cy: c.y, r });
        gcx += g.gx; gcy += g.gy; gn++;
      }
      // Centre of the ring = mean of domain centroids, projected.
      let center: { cx: number; cy: number; r: number } | null = null;
      if (gn > 0) {
        const cc = renderer.graphToViewport({ x: gcx / gn, y: gcy / gn });
        const cr0 = renderer.graphToViewport({ x: gcx / gn + 300, y: gcy / gn });
        center = { cx: cc.x, cy: cc.y, r: Math.hypot(cr0.x - cc.x, cr0.y - cc.y) };
      }
      setBackdrop({ sectors, center });
    };
    project();
    const camera = renderer.getCamera();
    camera.on("updated", project);
    const onResize = () => project();
    window.addEventListener("resize", onResize);
    // span the entry framing animation so the backdrop settles with the camera.
    // Refresh labels once after the entry animation settles.
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => {
      project();
      if (now - t0 < 1400) raf = requestAnimationFrame(loop);
      else recomputeLabelsRef.current?.();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      camera.removeListener("updated", project);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [domains, data, exploreNonce, stackPositions]);

  const isEmpty = visibleNodes !== null && visibleNodes.size === 0;
  const keyboardDomains = data.nodes.filter((node) => node.node_type === "domain" && node.ring === 0);
  const onGraphKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      keyboardIndexRef.current = (keyboardIndexRef.current + step + keyboardDomains.length) % keyboardDomains.length;
      setKeyboardDomain(keyboardDomains[keyboardIndexRef.current]?.label ?? "");
    } else if (event.key === "Enter" && keyboardIndexRef.current >= 0) {
      event.preventDefault();
      onSelect(keyboardDomains[keyboardIndexRef.current].id);
    } else if (event.key === "Escape") {
      keyboardIndexRef.current = -1;
      setKeyboardDomain("");
      onSelect(null);
    }
  };

  return (
    <div className="graph-canvas-wrap">
      {/* Atlas backdrop: soft domain-sector tints + centre identity. Behind the WebGL canvas,
          pointer-events:none, camera-synced. Decorative only — never affects graph events. */}
      {(backdrop.sectors.length > 0 || backdrop.center) && (
        <svg className="atlas-backdrop" aria-hidden>
          <defs>
            {backdrop.sectors.map((s) => (
              <radialGradient key={s.id} id={`sect-${s.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.11} />
                <stop offset="50%" stopColor={s.color} stopOpacity={0.045} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>
          {backdrop.sectors.map((s) => (
            <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} fill={`url(#sect-${s.id})`} />
          ))}
        </svg>
      )}
      <div
        ref={containerRef}
        className="graph-canvas"
        role="group"
        tabIndex={0}
        onKeyDown={onGraphKeyDown}
        aria-label="Technology graph. Use arrow keys to browse domains, Enter to open one, or Escape to clear selection. Search and the domain list provide access to every node."
      />
      {keyboardDomain && <div className="graph-keyboard-hint" aria-live="polite">{keyboardDomain} · press Enter to explore</div>}
      {headingScreens.filter((h) => h.visible).map((h) => (
        <div
          key={h.domainId}
          className="stack-heading"
          style={{ left: h.left, top: h.top, borderColor: h.color }}
          aria-hidden
        >
          <span className="stack-heading-dot" style={{ background: h.color }} />
          {h.label}
        </div>
      ))}
      {isEmpty && (
        <div className="graph-empty-state" role="status">
          <p>No nodes match the current filters.</p>
          <p className="muted">Clear a filter to see the graph again.</p>
        </div>
      )}
    </div>
  );
}
