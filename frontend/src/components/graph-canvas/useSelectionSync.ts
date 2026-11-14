import { useEffect } from "react";
import type { DetectionStatus } from "../../api/types";
import { selectPersistentLabels } from "../../graph/semanticZoom";
import type { LabelContext } from "../../graph/semanticZoom";
import type { CanvasRefs } from "./refs";

/**
 * Copies selection, filter and X-Ray overlay props into the refs the reducers read and
 * schedules a refresh. Never rebuilds the graph or touches coordinates. A selected edge
 * also glides the camera to frame both endpoints.
 */
export function useSelectionSync(refs: CanvasRefs, selectedId: string | null, selectedEdgeId: string | null, previewEdgeId: string | null,
  visibleNodes: Set<string> | null, visibleEdges: Set<string> | null,
  scanStatusByNode: Map<string, DetectionStatus> | null, scanHighlightEdges: Set<string> | null, scanContextEdges: Set<string> | null) {
  const { containerRef, graphRef, hoveredRef, persistentLabelsRef, previewEdgeRef, scanContextRef, scanEdgesRef, scanStatusRef, scheduleRefreshRef, selectedEdgeRef, selectedRef, sigmaRef, visibleEdgesRef, visibleNodesRef } = refs;
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
}
