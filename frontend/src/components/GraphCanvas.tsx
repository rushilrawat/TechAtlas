import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import type { DetectionStatus, GraphResponse } from "../api/types";
import { buildGraph } from "../graph/buildGraph";
import { bandOf, labelVisibleAtRatio, selectPersistentLabels } from "../graph/semanticZoom";
import type { LabelContext } from "../graph/semanticZoom";
import { computeFit } from "../graph/cameraFit";

interface Props {
  data: GraphResponse;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (id: string | null) => void;
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
}

// Explore state: the selected node's neighborhood is prominent; everything else recedes.
const DIM_NODE = "rgba(120,130,150,0.12)";
const DIM_EDGE = "rgba(120,130,150,0.035)";           // <=0.05 non-touching (UI-A R2.2)
const ACTIVE_EDGE = "rgba(150,180,255,0.55)";          // 0.50-0.60 touching (UI-A R2.1)

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
export function GraphCanvas({
  data,
  selectedId,
  focusId,
  onSelect,
  visibleNodes = null,
  visibleEdges = null,
  scanStatusByNode = null,
  scanHighlightEdges = null,
  scanContextEdges = null,
  fitSignal = null,
  stackPositions = null,
  stackHeadings = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
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
  // Projected screen positions for Stack View domain headings (DOM overlay).
  const [headingScreens, setHeadingScreens] = useState<
    { domainId: string; label: string; color: string; left: number; top: number; visible: boolean }[]
  >([]);

  // Build the Sigma instance once per dataset.
  useEffect(() => {
    if (!containerRef.current) return;
    const graph = buildGraph(data);
    graphRef.current = graph;

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: "line",
      labelColor: { color: "#c8d0e8" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      // UI-C: reduce Universe label collisions. Larger grid cells + lower density mean
      // fewer labels compete per screen region; the rendered-size threshold suppresses
      // labels for small nodes until the user zooms in (semantic zoom still applies on top).
      labelDensity: 0.5,
      labelGridCellSize: 110,
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
      graph.forEachNeighbor(active, (nb) => set.add(nb));
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

    // Which nodes may show labels at the current zoom (Task 8) — pure logic imported
    // from semanticZoom.ts and fed the live camera ratio.
    const labelVisible = (nodeType: string, size: number): boolean =>
      labelVisibleAtRatio(nodeType as never, size, ratioRef.current);

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

      // Semantic-zoom label gating.
      if (!labelVisible(dataIn.nodeType as string, dataIn.size as number)) {
        res.label = "";
      }

      if (!active) return res;
      const set = neighborSetRef.current;
      if (set && set.has(node)) {
        if (node === active) {
          res.zIndex = 2;
          res.highlighted = true;
          res.label = dataIn.label; // always label the active node
        }
        return res;
      }
      res.color = DIM_NODE;
      res.label = "";
      res.zIndex = 0;
      return res;
    });

    renderer.setSetting("edgeReducer", (edge, dataIn) => {
      // Phase 1B filter: hide edges whose endpoints aren't both visible.
      const vedges = visibleEdgesRef.current;
      if (vedges && !vedges.has(edge)) {
        return { ...dataIn, hidden: true };
      }
      // Repo X-Ray overlay: highlight only existing edges between two detected nodes.
      const scanEdges = scanEdgesRef.current;
      if (scanEdges) {
        if (stackActiveRef.current) {
          // Stack View default: suppress edges so domain grouping is not mistaken for a
          // dependency (spec SS3). BUT when a node is SELECTED, reveal only its VERIFIED
          // canonical edges to other detected nodes (spec SS2) — never co-occurrence edges.
          const act = activeRef.current;
          if (act && scanEdges.has(edge)) {
            const [es, et] = graph.extremities(edge);
            if (es === act || et === act) {
              // Cross-domain verified edges are styled distinctly (amber) from same-domain
              // (blue) so a grouping line is never confused with a real relationship.
              const sd = graph.getNodeAttribute(es, "primaryDomain");
              const td = graph.getNodeAttribute(et, "primaryDomain");
              const crossDomain = sd !== td;
              return {
                ...dataIn,
                color: crossDomain ? "rgba(251,191,36,0.85)" : "rgba(150,180,255,0.75)",
                size: crossDomain ? 2.0 : 1.6,
                zIndex: 3,
              };
            }
          }
          return { ...dataIn, hidden: true };
        }
        if (scanEdges.has(edge)) {
          return { ...dataIn, color: SCAN_HILITE_EDGE, size: 1.5, zIndex: 2 };
        }
        if (scanContextRef.current?.has(edge)) {
          return { ...dataIn, color: SCAN_CONTEXT_EDGE, size: 0.7, zIndex: 1 };
        }
        // Unrelated edges: hide outright. They are the majority and only add noise in a
        // scan read; hiding (not just alpha~0) also saves overdraw (perf R30).
        return { ...dataIn, hidden: true, color: SCAN_DIM_EDGE, zIndex: 0 };
      }
      const active = activeRef.current;
      if (!active) return dataIn;
      const [s, t] = graph.extremities(edge);
      if (s === active || t === active) {
        return { ...dataIn, color: ACTIVE_EDGE, size: 1.4, zIndex: 1 };
      }
      return { ...dataIn, color: DIM_EDGE, zIndex: 0 };
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
    renderer.on("clickNode", ({ node }) => onSelect(node));
    renderer.on("clickStage", () => onSelect(null));

    // Re-gate labels when the zoom level crosses a threshold (Task 8).
    const camera = renderer.getCamera();
    const onCameraUpdate = () => {
      const r = camera.getState().ratio;
      const crossed =
        bandOf(r) !== bandOf(ratioRef.current); // only refresh on band change
      ratioRef.current = r;
      if (crossed) scheduleRefresh();
    };
    camera.on("updated", onCameraUpdate);
    ratioRef.current = camera.getState().ratio;

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      camera.removeListener("updated", onCameraUpdate);
      renderer.kill();
      sigmaRef.current = null;
      graphRef.current = null;
      activeRef.current = null;
      neighborSetRef.current = null;
    };
  }, [data, onSelect]);

  // React to selection changes (recompute happens inside the scheduled refresh).
  useEffect(() => {
    selectedRef.current = selectedId;
    // Recompute the highlight set (not just a bare refresh) so selections coming
    // from search, the legend, a deep link, or the detail panel update the graph.
    scheduleRefreshRef.current?.();
  }, [selectedId]);

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

  // Animate the camera to the focused node; cancel any in-flight animation (Task 9).
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !focusId || !graph.hasNode(focusId)) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const display = renderer.getNodeDisplayData(focusId);
    if (!display) return;
    const camera = renderer.getCamera();
    // starting a new animation implicitly supersedes the previous target; calling
    // animate again is safe, but we null-out the callback timer by not chaining.
    camera.animate(
      { x: display.x, y: display.y, ratio: 0.35 },
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

  const isEmpty = visibleNodes !== null && visibleNodes.size === 0;

  return (
    <div className="graph-canvas-wrap">
      <div
        ref={containerRef}
        className="graph-canvas"
        role="application"
        aria-label="Interactive technology graph. Use the search box or the node list for keyboard access."
      />
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
