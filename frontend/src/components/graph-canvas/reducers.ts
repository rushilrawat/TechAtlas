import type Graph from "graphology";
import type { Attributes } from "graphology-types";
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { bandOf, labelVisibleAtRatio } from "../../graph/semanticZoom";
import { ACTIVE_CROSS_EDGE, CROSS_EDGE, DIM_NODE, RING_ALPHA, SCAN_CONTEXT_EDGE, SCAN_DIM_EDGE, SCAN_DIM_NODE,
  SCAN_HILITE_EDGE, STATUS_RING, fadeNode, withAlpha } from "./colors";
import type { CanvasRefs } from "./refs";

/**
 * Node styling for every mode (Explore, guided path, edge focus, Repo X-Ray Universe and
 * Stack View). Runs per node per frame, so it only reads precomputed refs.
 */
export function createNodeReducer(graph: Graph, refs: CanvasRefs): (node: string, dataIn: Attributes) => Partial<NodeDisplayData> {
  const { activeRef, focusFadeRef, hoveredRef, journeyNodesRef, neighborSetRef, persistentLabelsRef, ratioRef, scanStatusRef, selectedEdgeRef, sizeScaleRef, stackActiveRef, visibleNodesRef } = refs;
  // Which nodes may show labels at the current zoom (Task 8) — pure logic imported
  // from semanticZoom.ts and fed the live camera ratio. On NARROW (mobile) viewports the
  // overview band shows ONLY top-level domain labels (redesign §3): even the large hubs
  // are suppressed until the user zooms in, so domain names never fight each other for
  // space. Sigma's enlarged collision grid then drops any domain labels that still touch.
  const labelVisible = (nodeType: string, size: number): boolean => {
    if (bandOf(ratioRef.current) <= 1) return nodeType === "domain";
    return labelVisibleAtRatio(nodeType as never, size, ratioRef.current);
  };

  return (node, dataIn) => {
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

    if (journeyNodesRef.current.size && !scanStatusRef.current) {
      res.size = (dataIn.size as number) * sizeScaleRef.current;
      if (journeyNodesRef.current.has(node)) { res.forceLabel = true; res.zIndex = 4; return res; }
      res.color = fadeNode(dataIn.color, 0.28); res.label = ""; res.zIndex = 0; return res;
    }

    // Repo X-Ray overlay (Phase 1.5B): detected nodes keep their domain color and
    // size but gain a status-colored ring; everything else dims. This is applied
    // before the hover/selection highlight so a scan read is stable.
    const scan = scanStatusRef.current;
    if (scan) {
      // Stack View spaces its own positions for the larger API sizes; Universe View keeps
      // the canonical atlas, whose spacing is laid out for the drawn sizes.
      res.size = stackActiveRef.current
        ? (dataIn.apiSize as number | undefined) ?? dataIn.size
        : (dataIn.size as number) * sizeScaleRef.current;
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

    // Semantic-zoom label gating. Top-level domain names are DOM headings, so their
    // anchors never carry a competing WebGL label.
    const isDomain = dataIn.nodeType === "domain";
    const ring = (dataIn.ring as number | undefined) ?? 0;
    // Nested subdomain names join the labels once the camera reaches detail zoom.
    if (!labelVisible(dataIn.nodeType as string, dataIn.size as number) || (isDomain && ring === 0)
      || (isDomain && bandOf(ratioRef.current) <= 1)) {
      res.label = "";
    }
    // One size table in every state: emphasis is color and alpha, never a size jump.
    res.size = (dataIn.size as number) * sizeScaleRef.current;

    if (!active) {
      res.zIndex = isDomain ? 2 : ring === 1 ? 1 : 0;
      if (!isDomain) res.color = fadeNode(dataIn.color, RING_ALPHA[ring] ?? 0.8);
      return res;
    }
    const set = neighborSetRef.current;
    if (set && set.has(node)) {
      res.zIndex = node === active ? 3 : 2;
      // Always label the active node; a top-level domain's name is its DOM heading, and
      // Sigma's highlight box would otherwise draw an empty label plate beside it.
      if (node === active && !(isDomain && ring === 0)) {
        res.highlighted = true;
        res.label = dataIn.label;
      }
      return res;
    }
    // Context recedes but keeps its domain hue, so the map stays readable around a focus.
    res.color = fadeNode(dataIn.color, 0.3 + ((RING_ALPHA[ring] ?? 0.8) - 0.3) * (1 - focusFadeRef.current));
    res.label = "";
    res.zIndex = 0;
    return res;
  };
}

/** Edge styling for every mode; see createNodeReducer. */
export function createEdgeReducer(graph: Graph, refs: CanvasRefs, scanClearEdges: Set<string>): (edge: string, dataIn: Attributes) => Partial<EdgeDisplayData> {
  const { activeRef, focusFadeRef, hoverDomainSetRef, hoveredRef, journeyEdgesRef, neighborSetRef, previewEdgeRef, ratioRef, scanContextRef, scanEdgesRef, scanStatusRef, selectedEdgeRef, selectedRef, stackActiveRef, visibleEdgesRef } = refs;
  return (edge, dataIn) => {
    // Phase 1B filter: hide edges whose endpoints aren't both visible.
    const vedges = visibleEdgesRef.current;
    if (vedges && !vedges.has(edge)) {
      return { ...dataIn, hidden: true };
    }
    if (journeyEdgesRef.current.size && !scanStatusRef.current) {
      return journeyEdgesRef.current.has(edge)
        ? { ...dataIn, color: "rgba(245,207,130,.95)", size: 2.2, zIndex: 4 }
        : { ...dataIn, hidden: true };
    }
    const shownEdge = selectedEdgeRef.current ?? previewEdgeRef.current;
    if (shownEdge) {
      if (edge !== shownEdge) return { ...dataIn, hidden: true };
      const [source, target] = graph.extremities(edge);
      const cross = graph.getNodeAttribute(source, "primaryDomain") !== graph.getNodeAttribute(target, "primaryDomain");
      return { ...dataIn, color: cross ? "rgba(251,191,36,0.95)" : "rgba(150,180,255,0.9)",
        size: 2.4, zIndex: 4 };
    }
    // Repo X-Ray overlay: highlight only existing edges between two detected nodes.
    const scanEdges = scanEdgesRef.current;
    if (scanEdges) {
      if (stackActiveRef.current) {
        // Reveal only canonical edges from the selected detection to another detected
        // node. A scan alone never invents a relationship between technologies.
        const active = selectedRef.current;
        if (active && scanEdges.has(edge)) {
          const [source, target] = graph.extremities(edge);
          if (source === active || target === active) {
            const cross = graph.getNodeAttribute(source, "primaryDomain") !== graph.getNodeAttribute(target, "primaryDomain");
            return { ...dataIn, color: cross ? "rgba(251,191,36,.9)" : SCAN_HILITE_EDGE, size: 1.6, zIndex: 3 };
          }
        }
        return { ...dataIn, hidden: true };
      }
      if (activeRef.current || !scanClearEdges.has(edge)) return { ...dataIn, hidden: true };
      if (scanEdges.has(edge)) return { ...dataIn, color: SCAN_HILITE_EDGE, size: 1.5, zIndex: 2 };
      if (scanContextRef.current?.has(edge)) return { ...dataIn, color: SCAN_CONTEXT_EDGE, size: 0.7, zIndex: 1 };
      // Unrelated edges: hide outright. They are the majority and only add noise in a
      // scan read; hiding (not just alpha~0) also saves overdraw (perf R30).
      return { ...dataIn, hidden: true, color: SCAN_DIM_EDGE, zIndex: 0 };
    }
    const tier = dataIn.tier as string;
    const cross = dataIn.crossDomain as boolean;
    const [source, target] = graph.extremities(edge);
    const tint = graph.getNodeAttribute(source, "color");
    const active = activeRef.current;
    const overview = bandOf(ratioRef.current) <= 1;
    const backbone = tier === "TierA" || tier === "TierB" || tier === "TierC";
    // Explore zoom disclosure: the sparse backbone at overview, plus the remaining
    // local (Tier D) relationships once zoomed into detail. Cross-domain Tier D edges
    // and plain membership spokes (already conveyed by radial position) appear only
    // for a selection that touches them.
    const spoke = dataIn.relationshipType === "belongs_to_domain";
    const zoomVisible = backbone || (!overview && !cross && !spoke);
    const quiet = cross ? CROSS_EDGE
      : withAlpha(tint, tier === "TierA" ? 0.65 : tier === "TierB" ? 0.58 : 0.22);
    const quietSize = tier === "TierA" ? 1.1 : tier === "TierD" ? 0.6 : cross ? 0.8 : 1;
    if (!active) {
      // Long cross-domain arcs only appear for a hovered or tapped node; at rest the
      // map shows each field's own structure without lines slicing across it.
      return zoomVisible && !cross ? { ...dataIn, color: quiet, size: quietSize, zIndex: 1 }
        : { ...dataIn, hidden: true };
    }
    // With something selected, hovering another node still previews all of its links.
    const hovered = hoveredRef.current;
    const hoverSet = hoverDomainSetRef.current;
    if (hovered && hovered !== active && (source === hovered || target === hovered
      || (!!hoverSet && hoverSet.has(source) && hoverSet.has(target)))) {
      return { ...dataIn, color: cross ? ACTIVE_CROSS_EDGE : withAlpha(tint, 0.75), size: 1.1, zIndex: 2 };
    }
    const set = neighborSetRef.current;
    const domainFocus = graph.getNodeAttribute(active, "nodeType") === "domain";
    const related = domainFocus
      // A clicked or hovered field shows its whole internal network, every edge among its members.
      ? !!set && ((set.has(source) && set.has(target))
        // A tapped field also reveals its backbone links out to other fields.
        || (cross && backbone && (set.has(source) || set.has(target))))
      : source === active || target === active;
    if (related) {
      return { ...dataIn, color: cross ? ACTIVE_CROSS_EDGE : withAlpha(tint, 0.85),
        size: domainFocus ? 0.9 : 1.3, zIndex: 3 };
    }
    // Unrelated relationships stay as the faintest context while something is focused.
    return zoomVisible && !cross ? { ...dataIn, color: withAlpha(tint, 0.07 + 0.4 * (1 - focusFadeRef.current)), size: 0.45, zIndex: 0 }
      : { ...dataIn, hidden: true };
  };
}
