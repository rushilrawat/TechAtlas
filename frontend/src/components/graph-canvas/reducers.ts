import type Graph from "graphology";
import type { Attributes } from "graphology-types";
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { bandOf, labelVisibleAtRatio } from "../../graph/semanticZoom";
import { crossLinkColor, dimNode, RING_ALPHA, scanContextEdge, SCAN_DIM_EDGE, scanDimNode,
  scanHiliteEdge, statusRing, fadeNode, withAlpha } from "./colors";
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
        res.borderColor = statusRing(status);
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
      res.color = scanDimNode();
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
        res.color = dimNode();
        res.label = "";
        res.size = Math.min(dataIn.size as number, 2.2);
      }
      return res;
    }

    // Semantic-zoom label gating. Top-level domain names are DOM headings, so their
    // anchors never carry a competing WebGL label.
    const isDomain = dataIn.nodeType === "domain";
    const ring = (dataIn.ring as number | undefined) ?? 0;
    // Nested sub-field names (GenAI, Observability, Graphics…) show from the default atlas
    // zoom on, so every cluster on the map has a name; only the far-out universe band hides them.
    if (!labelVisible(dataIn.nodeType as string, dataIn.size as number) || (isDomain && ring === 0)
      || (isDomain && bandOf(ratioRef.current) === 0)) {
      res.label = "";
    } else if (isDomain && !active) {
      res.forceLabel = true;
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
  const { activeRef, hoverDomainSetRef, hoveredRef, journeyEdgesRef, neighborSetRef, previewEdgeRef, scanContextRef, scanEdgesRef, scanStatusRef, selectedEdgeRef, selectedRef, stackActiveRef, visibleEdgesRef } = refs;
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
            return { ...dataIn, color: cross ? "rgba(251,191,36,.9)" : scanHiliteEdge(), size: 1.6, zIndex: 3 };
          }
        }
        return { ...dataIn, hidden: true };
      }
      if (activeRef.current || !scanClearEdges.has(edge)) return { ...dataIn, hidden: true };
      if (scanEdges.has(edge)) return { ...dataIn, color: scanHiliteEdge(), size: 1.5, zIndex: 2 };
      if (scanContextRef.current?.has(edge)) return { ...dataIn, color: scanContextEdge(), size: 0.7, zIndex: 1 };
      // Unrelated edges: hide outright. They are the majority and only add noise in a
      // scan read; hiding (not just alpha~0) also saves overdraw (perf R30).
      return { ...dataIn, hidden: true, color: SCAN_DIM_EDGE, zIndex: 0 };
    }
    const tier = dataIn.tier as string;
    const cross = dataIn.crossDomain as boolean;
    const [source, target] = graph.extremities(edge);
    const tint = graph.getNodeAttribute(source, "color");
    const active = activeRef.current;
    const backbone = tier === "TierA" || tier === "TierB" || tier === "TierC";
    const CROSS_LINK = crossLinkColor();
    // Clean atlas: no lines at rest, at any zoom. A node's or field's connections
    // appear only while it is hovered or tapped.
    if (!active) return { ...dataIn, hidden: true };
    // With something selected, hovering another node still previews all of its links.
    const hovered = hoveredRef.current;
    const hoverSet = hoverDomainSetRef.current;
    if (hovered && hovered !== active && (source === hovered || target === hovered
      || (!!hoverSet && hoverSet.has(source) && hoverSet.has(target)))) {
      return { ...dataIn, color: cross ? CROSS_LINK : withAlpha(tint, 0.75), size: cross ? 1.3 : 1.1, zIndex: 2 };
    }
    const set = neighborSetRef.current;
    const domainFocus = graph.getNodeAttribute(active, "nodeType") === "domain";
    // A field's spokes (field node to each member, ~175 for Backend) carry no information at
    // that density: its members are already lit in the field's colour, so they are skipped.
    // The ~400 links among its members are the same hairball one level down, so a selected
    // field shows only its backbone bridges to other fields.
    if (domainFocus && (source === active || target === active || !cross)) return { ...dataIn, hidden: true };
    const related = domainFocus
      // A clicked field shows the links among its members, not a hairball from its centre.
      ? !!set && ((set.has(source) && set.has(target))
        // A tapped field also reveals its backbone links out to other fields.
        || (cross && backbone && (set.has(source) || set.has(target))))
      : source === active || target === active;
    if (related) {
      // Within a field: the field's own colour. Between fields: one distinct link colour,
      // drawn a touch heavier, so a bridge never reads as part of either cluster.
      return { ...dataIn, color: cross ? CROSS_LINK : withAlpha(tint, 0.85),
        size: cross ? (domainFocus ? 1.1 : 1.6) : (domainFocus ? 0.9 : 1.3), zIndex: cross ? 4 : 3 };
    }
    // Everything unrelated stays hidden, so a selection shows only its own connections.
    return { ...dataIn, hidden: true };
  };
}
