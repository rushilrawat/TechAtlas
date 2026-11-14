import { useEffect } from "react";
import { fitStack } from "./framing";
import type { CanvasRefs, Point } from "./refs";

export function useStackProjection(refs: CanvasRefs, stackPositions: Map<string, Point> | null,
  stackHeadings: { x: number; y: number }[] | null) {
  const { framedStackRef, graphRef, savedCoordsRef, sigmaRef, stackActiveRef, stackAnimRef, stackHeadingsRef, stackPositionsRef } = refs;
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
      if (prefersReduced) {
        apply(1);
      } else {
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
      }
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
}
