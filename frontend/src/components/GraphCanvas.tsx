import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import type { GraphResponse } from "../api/types";
import { buildGraph } from "../graph/buildGraph";

interface Props {
  data: GraphResponse;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (id: string | null) => void;
}

const DIM_NODE = "rgba(120,130,150,0.12)";
const DIM_EDGE = "rgba(120,130,150,0.04)";

/**
 * The primary WebGL visualization. Owns the Sigma instance imperatively; React
 * only drives it through the `selectedId` / `focusId` props. Keeping Sigma out of
 * React's render loop avoids re-creating the renderer on every interaction (spec §15).
 */
export function GraphCanvas({ data, selectedId, focusId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);

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
      labelDensity: 0.6,
      labelGridCellSize: 70,
      zIndex: true,
      minCameraRatio: 0.08,
      maxCameraRatio: 2.5,
    });
    sigmaRef.current = renderer;

    const adjacency = (id: string): Set<string> => {
      const set = new Set<string>([id]);
      graph.forEachNeighbor(id, (nb) => set.add(nb));
      return set;
    };

    // Node reducer: dim everything not connected to the hovered/selected node.
    renderer.setSetting("nodeReducer", (node, dataIn) => {
      const active = selectedRef.current ?? hoveredRef.current;
      if (!active) return dataIn;
      const visible = adjacency(active);
      if (visible.has(node)) {
        return node === active ? { ...dataIn, zIndex: 2, highlighted: true } : dataIn;
      }
      return { ...dataIn, color: DIM_NODE, label: "", zIndex: 0 };
    });

    renderer.setSetting("edgeReducer", (edge, dataIn) => {
      const active = selectedRef.current ?? hoveredRef.current;
      if (!active) return dataIn;
      const [s, t] = graph.extremities(edge);
      if (s === active || t === active) {
        return { ...dataIn, color: "rgba(180,200,255,0.55)", size: 1.4, zIndex: 1 };
      }
      return { ...dataIn, color: DIM_EDGE, zIndex: 0 };
    });

    renderer.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      renderer.refresh();
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hoveredRef.current = null;
      renderer.refresh();
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });
    renderer.on("clickNode", ({ node }) => onSelect(node));
    renderer.on("clickStage", () => onSelect(null));

    return () => {
      renderer.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [data, onSelect]);

  // React to selection changes.
  useEffect(() => {
    selectedRef.current = selectedId;
    sigmaRef.current?.refresh();
  }, [selectedId]);

  // Animate the camera to the focused node (search / deep link / neighbor click).
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !focusId || !graph.hasNode(focusId)) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const display = renderer.getNodeDisplayData(focusId);
    if (!display) return;
    renderer.getCamera().animate(
      { x: display.x, y: display.y, ratio: 0.35 },
      { duration: prefersReducedMotion ? 0 : 500 },
    );
  }, [focusId]);

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      role="application"
      aria-label="Interactive technology graph. Use the search box or the node list for keyboard access."
    />
  );
}
