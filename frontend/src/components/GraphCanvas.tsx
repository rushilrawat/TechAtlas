import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import type { DetectionStatus, GraphResponse } from "../api/types";
import { buildGraph } from "../graph/buildGraph";
import { bandOf, labelVisibleAtRatio } from "../graph/semanticZoom";

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
  // "Focus Stack": a bounds + nonce to frame the detected region. Bumping the nonce
  // re-triggers the fit (so the button works repeatedly).
  fitSignal?: { ids: string[]; nonce: number } | null;
}

const DIM_NODE = "rgba(120,130,150,0.12)";
const DIM_EDGE = "rgba(120,130,150,0.04)";

// Repo X-Ray detection-status ring colors (spec §5: a SEPARATE visual channel from the
// node's domain color). confirmed=green, declared=blue, inferred=amber, related=neutral.
const STATUS_RING: Record<DetectionStatus, string> = {
  confirmed: "#4ade80",
  declared: "#60a5fa",
  inferred: "#fbbf24",
  related: "#c0caf5",
};
const SCAN_DIM_NODE = "rgba(120,130,150,0.10)";
const SCAN_HILITE_EDGE = "rgba(180,200,255,0.5)";
const SCAN_DIM_EDGE = "rgba(120,130,150,0.035)";

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
export function GraphCanvas({
  data,
  selectedId,
  focusId,
  onSelect,
  visibleNodes = null,
  visibleEdges = null,
  scanStatusByNode = null,
  scanHighlightEdges = null,
  fitSignal = null,
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
  // rAF coalescing for refreshes (Task 7).
  const rafRef = useRef<number | null>(null);
  // Exposes the build-effect's coalesced refresh to the selection/filter effects,
  // so a selection change from search/legend/deep-link/panel recomputes the highlight
  // set (not just a bare renderer.refresh()).
  const scheduleRefreshRef = useRef<(() => void) | null>(null);
  const ratioRef = useRef<number>(1);

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
      labelDensity: 0.7,
      labelGridCellSize: 70,
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
          // keep domain color (res.color unchanged) and size; label only the hovered/active
          if (node !== active && node !== hoveredRef.current) res.label = "";
          return res;
        }
        // not detected -> fade into the background
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
        if (scanEdges.has(edge)) {
          return { ...dataIn, color: SCAN_HILITE_EDGE, size: 1.4, zIndex: 1 };
        }
        return { ...dataIn, color: SCAN_DIM_EDGE, zIndex: 0 };
      }
      const active = activeRef.current;
      if (!active) return dataIn;
      const [s, t] = graph.extremities(edge);
      if (s === active || t === active) {
        return { ...dataIn, color: "rgba(180,200,255,0.55)", size: 1.4, zIndex: 1 };
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
    const renderer = sigmaRef.current;
    if (renderer) renderer.refresh();
  }, [scanStatusByNode, scanHighlightEdges]);

  // "Focus Stack" — frame the detected nodes' bounding region with padding, keeping
  // labels readable (never zoom so far the graph is unusable). Uses the precomputed
  // coordinates; never relayouts.
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !fitSignal || fitSignal.ids.length === 0) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Convert the graph-space span to a camera ratio against the graph's own extent,
    // with padding, and clamp so we never zoom out past the full universe or in too far.
    const gw = Math.max(maxX - minX, 1e-6);
    const gh = Math.max(maxY - minY, 1e-6);
    // Sigma's default ratio 1 ~ shows the whole graph; approximate a framing ratio from
    // the detected span relative to the full node spread.
    let fullMinX = Infinity, fullMaxX = -Infinity, fullMinY = Infinity, fullMaxY = -Infinity;
    graph.forEachNode((_n, a) => {
      const x = a.x as number, y = a.y as number;
      fullMinX = Math.min(fullMinX, x); fullMaxX = Math.max(fullMaxX, x);
      fullMinY = Math.min(fullMinY, y); fullMaxY = Math.max(fullMaxY, y);
    });
    const fullW = Math.max(fullMaxX - fullMinX, 1e-6);
    const fullH = Math.max(fullMaxY - fullMinY, 1e-6);
    const spanRatio = Math.max(gw / fullW, gh / fullH);
    const ratio = Math.min(1.1, Math.max(0.12, spanRatio * 1.4 + 0.08));
    // Map graph center to the camera's normalized coordinate space.
    const nx = (cx - fullMinX) / fullW;
    const ny = 1 - (cy - fullMinY) / fullH;
    camera.animate(
      { x: nx, y: ny, ratio },
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

  const isEmpty = visibleNodes !== null && visibleNodes.size === 0;

  return (
    <div className="graph-canvas-wrap">
      <div
        ref={containerRef}
        className="graph-canvas"
        role="application"
        aria-label="Interactive technology graph. Use the search box or the node list for keyboard access."
      />
      {isEmpty && (
        <div className="graph-empty-state" role="status">
          <p>No nodes match the current filters.</p>
          <p className="muted">Clear a filter to see the graph again.</p>
        </div>
      )}
    </div>
  );
}
