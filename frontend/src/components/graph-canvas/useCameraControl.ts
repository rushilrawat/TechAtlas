import { useEffect, useRef } from "react";
import { computeFit } from "../../graph/cameraFit";
import { fitExplore, fitStack } from "./framing";
import type { CanvasRefs } from "./refs";

/** Camera moves driven by props: Focus Stack, the Explore home reframe, and node focus. */
export function useCameraControl(refs: CanvasRefs, fitSignal: { ids: string[]; nonce: number; sidebarWidthPx?: number } | null,
  exploreNonce: number, focusId: string | null) {
  const { containerRef, focusBBoxRef, graphRef, sigmaRef, sizeScaleRef, stackActiveRef, stackHeadingsRef, stackPositionsRef } = refs;
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
      sizeScaleRef.current = fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      renderer.refresh();
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
        sizeScaleRef.current = fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
    // Keep the current zoom when already close in, so walking node to node (arrows,
    // neighbours) glides instead of bouncing the zoom level each step.
    const ratio = narrow ? (isDomain ? 0.8 : 0.55)
      : Math.min(camera.getState().ratio, isDomain ? 0.5 : 0.35);
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
      { duration: prefersReducedMotion ? 0 : 520, easing: "cubicInOut" },
    );
  }, [focusId]);
}
