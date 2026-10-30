import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import type { GraphResponse } from "../api/types";
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
}

const DIM_NODE = "rgba(120,130,150,0.12)";
const DIM_EDGE = "rgba(120,130,150,0.04)";

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
  // rAF coalescing for refreshes (Task 7).
  const rafRef = useRef<number | null>(null);
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
    });
    sigmaRef.current = renderer;

    // Compute the highlight set once whenever the active node changes.
    const recomputeActive = () => {
      const active = selectedRef.current ?? hoveredRef.current;
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
    const renderer = sigmaRef.current;
    if (!renderer) return;
    // force a refresh to pick up the new selection
    renderer.refresh();
  }, [selectedId]);

  // React to filter changes: update the live sets the reducers read, then refresh.
  // We never rebuild the graph or touch coordinates (requirement 1.7).
  useEffect(() => {
    visibleNodesRef.current = visibleNodes;
    visibleEdgesRef.current = visibleEdges;
    const renderer = sigmaRef.current;
    if (renderer) renderer.refresh();
  }, [visibleNodes, visibleEdges]);

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
