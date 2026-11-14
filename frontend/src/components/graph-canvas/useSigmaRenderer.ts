import { useEffect, useState } from "react";
import Sigma from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import EdgeCurveProgram from "@sigma/edge-curve";
import type { GraphResponse } from "../../api/types";
import { api } from "../../api/client";
import { buildGraph, curvePoint, domainMemberIds } from "../../graph/buildGraph";
import { bandOf } from "../../graph/semanticZoom";
import { selectClearEdges } from "../../graph/clearEdges";
import type { SharedCamera } from "../../graph/shareView";
import { drawNodeHover } from "./drawNodeHover";
import { fitExplore } from "./framing";
import { createEdgeReducer, createNodeReducer } from "./reducers";
import type { CanvasRefs } from "./refs";

export type HoverPreview = { id: string; x: number; y: number; description: string };

/**
 * Builds the Sigma instance once per dataset, wires the reducers, pointer events and
 * camera listener, and returns the hover-card state the overlay renders.
 */
export function useSigmaRenderer(refs: CanvasRefs, data: GraphResponse, initialCamera: SharedCamera | null) {
  const { activeRef, containerRef, descriptionsRef, focusFadeRef, graphRef, hoverDomainSetRef, hoveredRef, neighborSetRef, onCameraChangeRef, onSelectEdgeRef, onSelectRef, pendingDescriptionsRef, rafRef, ratioRef, scheduleRefreshRef, selectedRef, sigmaRef, sizeScaleRef, stackActiveRef, visibleNodesRef } = refs;
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);

  // Build the Sigma instance once per dataset.
  useEffect(() => {
    if (!containerRef.current) return;
    const graph = buildGraph(data);
    // Repo X-Ray Universe keeps its own clear, non-overlapping edge subset; Explore uses the
    // generator's edge tiers instead (the two modes never share an edge filter).
    const scanClearEdges = selectClearEdges(data, 12, 150, true, 10);
    graphRef.current = graph;

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: "curved",
      edgeProgramClasses: { curved: EdgeCurveProgram },
      enableEdgeEvents: true,
      labelColor: { color: "#c8d0e8" },
      defaultDrawNodeHover: drawNodeHover,
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
      sizeScaleRef.current = fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (initialCamera) renderer.getCamera().setState(initialCamera);
      renderer.refresh();
    });

    // Test-only renderer handle, compiled in ONLY when VITE_TEST_HOOKS is set at build
    // time (the e2e harness build). It is tree-shaken out of the production deploy build,
    // so no internal renderer reference is ever exposed to shipped users.
    if (import.meta.env.VITE_TEST_HOOKS === "true" && typeof window !== "undefined") {
      (window as unknown as { __ta_sigma?: unknown }).__ta_sigma = renderer;
    }

    // Compute the highlight set once whenever the active node changes.
    // Focus transition: 0 = nothing receded yet, 1 = the rest of the map fully dimmed.
    let fadeRaf = 0;
    const startFocusFade = () => {
      cancelAnimationFrame(fadeRaf);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { focusFadeRef.current = 1; return; }
      const t0 = performance.now();
      focusFadeRef.current = 0;
      const step = (now: number) => {
        focusFadeRef.current = Math.min(1, (now - t0) / 320);
        renderer.refresh();
        if (focusFadeRef.current < 1) fadeRaf = requestAnimationFrame(step);
      };
      fadeRaf = requestAnimationFrame(step);
    };
    const recomputeActive = () => {
      let active = selectedRef.current ?? hoveredRef.current;
      // If a filter currently hides the active node, don't treat it as active —
      // otherwise every visible node outside its neighbor set gets dimmed and the
      // graph looks blanked (requirement: handle selection hidden by filtering).
      const vis = visibleNodesRef.current;
      if (active && vis && !vis.has(active)) active = null;
      if (active === activeRef.current) return;
      // A new selection (not a hover) eases the rest of the map back instead of snapping.
      if (active && active === selectedRef.current) startFocusFade();
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
    renderer.setSetting("nodeReducer", createNodeReducer(graph, refs));
    renderer.setSetting("edgeReducer", createEdgeReducer(graph, refs, scanClearEdges));

    renderer.on("enterNode", ({ node, event }) => {
      hoveredRef.current = node;
      hoverDomainSetRef.current = graph.getNodeAttribute(node, "nodeType") === "domain"
        ? new Set<string>([node, ...domainMemberIds(graph, node)]) : null;
      if (window.matchMedia("(hover: hover)").matches && "clientX" in event.original) {
        const bounds = containerRef.current?.getBoundingClientRect();
        const x = Math.min(event.original.clientX - (bounds?.left ?? 0) + 18, (bounds?.width ?? 0) - 250);
        const y = Math.min(event.original.clientY - (bounds?.top ?? 0) + 18, (bounds?.height ?? 0) - 110);
        setHoverPreview({ id: node, x: Math.max(8, x), y: Math.max(8, y), description: descriptionsRef.current.get(node) ?? "" });
        const item = data.nodes.find((n) => n.id === node);
        if (item && !descriptionsRef.current.has(node) && !pendingDescriptionsRef.current.has(node)) {
          pendingDescriptionsRef.current.add(node);
          void api.node(item.slug).then((detail) => {
            descriptionsRef.current.set(node, detail.short_description);
            setHoverPreview((current) => current?.id === node ? { ...current, description: detail.short_description } : current);
          }).catch(() => { descriptionsRef.current.set(node, ""); }).finally(() => pendingDescriptionsRef.current.delete(node));
        }
      }
      scheduleRefresh();
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hoveredRef.current = null;
      hoverDomainSetRef.current = null;
      setHoverPreview(null);
      scheduleRefresh();
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });
    renderer.on("clickNode", ({ node }) => {
      setHoverPreview(null);
      onSelectRef.current(node);
    });
    renderer.on("clickEdge", ({ edge }) => onSelectEdgeRef.current?.(edge));
    renderer.on("clickStage", ({ event }) => {
      // Phones: a tap near a node selects it before any nearby curve (nodes are the
      // primary targets and are too small to hit exactly at the all-in-one fit).
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
        if (nearest) { onSelectRef.current(nearest); return; }
      }
      let nearEdge: string | null = null, bestEdgeDistance = 5;
      if (onSelectEdgeRef.current) graph.forEachEdge((id, _attrs, source, target) => {
        if (renderer.getEdgeDisplayData(id)?.hidden) return;
        const ga = graph.getNodeAttributes(source) as { x: number; y: number };
        const gb = graph.getNodeAttributes(target) as { x: number; y: number };
        const k = (graph.getEdgeAttribute(id, "curvature") as number) ?? 0;
        let previous = renderer.graphToViewport(ga);
        for (let i = 1; i <= 16; i++) {
          const next = renderer.graphToViewport(curvePoint(ga, gb, k, i / 16));
          const dx = next.x - previous.x, dy = next.y - previous.y;
          const v = Math.max(0, Math.min(1, ((event.x - previous.x) * dx + (event.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
          const distance = Math.hypot(event.x - previous.x - v * dx, event.y - previous.y - v * dy);
          if (distance < bestEdgeDistance) { bestEdgeDistance = distance; nearEdge = id; }
          previous = next;
        }
      });
      if (nearEdge && onSelectEdgeRef.current) { onSelectEdgeRef.current(nearEdge); return; }
      onSelectRef.current(null);
    });

    // Re-gate labels when the zoom level crosses a threshold (Task 8).
    const camera = renderer.getCamera();
    let cameraTimer: number | undefined;
    const onCameraUpdate = () => {
      window.clearTimeout(cameraTimer);
      cameraTimer = window.setTimeout(() => { const { x, y, ratio } = camera.getState(); onCameraChangeRef.current?.({ x, y, ratio }); }, 400);
      const r = camera.getState().ratio;
      const crossed =
        bandOf(r) !== bandOf(ratioRef.current); // refresh on band change
      ratioRef.current = r;
      if (crossed) scheduleRefresh();
    };
    camera.on("updated", onCameraUpdate);
    ratioRef.current = camera.getState().ratio;

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      cancelAnimationFrame(fadeRaf);
      window.clearTimeout(cameraTimer);
      camera.removeListener("updated", onCameraUpdate);
      renderer.kill();
      sigmaRef.current = null;
      graphRef.current = null;
      activeRef.current = null;
      neighborSetRef.current = null;
    };
  // The renderer is built once per dataset; selection callbacks are read through refs so
  // a parent re-creating them (e.g. compare or guided-path state) never rebuilds Sigma.
  }, [data]);
  return hoverPreview;
}
