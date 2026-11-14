import { useEffect, useState } from "react";
import type { CanvasRefs, Point } from "./refs";

export type StackHeading = { domainId: string; label: string; color: string; x: number; y: number };

export function useStackHeadings(refs: CanvasRefs, stackHeadings: StackHeading[] | null,
  stackPositions: Map<string, Point> | null, fitNonce: number | undefined) {
  const { sigmaRef } = refs;
  const [headingScreens, setHeadingScreens] = useState<
    { domainId: string; label: string; color: string; left: number; top: number; visible: boolean }[]
  >([]);

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
  }, [stackHeadings, stackPositions, fitNonce]);
  return headingScreens;
}
