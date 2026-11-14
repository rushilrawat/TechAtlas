import { useEffect } from "react";
import { fitExplore } from "./framing";
import type { CanvasRefs } from "./refs";

export function useKeyboardNav(refs: CanvasRefs) {
  const { graphRef, onSelectRef, selectedRef, sigmaRef, sizeScaleRef, stackActiveRef, visibleNodesRef } = refs;
  // ---- Keyboard exploration ----
  // Arrows walk the map: from the selected node, move to the connected node that lies in
  // that direction on screen (a domain also reaches the other domain anchors). With
  // nothing selected, the first arrow picks the domain nearest the screen centre in that
  // direction. Shift+arrows pan, +/- zoom, 0 re-frames, Escape clears.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable='true'], .xray-panel, .about-page")) return;
      if (target?.tagName === "BUTTON" && event.key === "Enter") return;
      const renderer = sigmaRef.current, graph = graphRef.current;
      if (!renderer || !graph || stackActiveRef.current) return;
      const camera = renderer.getCamera();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ease = { duration: reduce ? 0 : 280, easing: "quadraticOut" as const };
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const dir = dirs[event.key];
      if (dir && event.shiftKey) {
        event.preventDefault();
        const { x, y, ratio } = camera.getState();
        void camera.animate({ x: x + dir[0] * 0.12 * ratio, y: y - dir[1] * 0.12 * ratio }, ease);
        return;
      }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); void camera.animatedZoom({ duration: ease.duration, factor: 1.4 }); return; }
      if (event.key === "-" || event.key === "_") { event.preventDefault(); void camera.animatedUnzoom({ duration: ease.duration, factor: 1.4 }); return; }
      if (event.key === "0") { event.preventDefault(); sizeScaleRef.current = fitExplore(renderer, reduce); return; }
      if (event.key === "Escape") { onSelectRef.current(null); return; }
      if (!dir) return;
      event.preventDefault();
      const vis = visibleNodesRef.current;
      const screen = (id: string) => renderer.graphToViewport(graph.getNodeAttributes(id) as { x: number; y: number });
      const from = selectedRef.current && graph.hasNode(selectedRef.current) ? selectedRef.current : null;
      const origin = from ? screen(from) : { x: renderer.getContainer().clientWidth / 2, y: renderer.getContainer().clientHeight / 2 };
      const candidates = new Set<string>();
      if (from) {
        graph.forEachNeighbor(from, (n) => candidates.add(n));
        if (graph.getNodeAttribute(from, "nodeType") === "domain") {
          graph.forEachNode((id, a) => { if (a.nodeType === "domain" && a.ring === 0) candidates.add(id); });
        }
      } else {
        graph.forEachNode((id, a) => { if (a.nodeType === "domain" && a.ring === 0) candidates.add(id); });
      }
      let best: string | null = null, bestScore = Infinity;
      for (const id of candidates) {
        if (id === from || (vis && !vis.has(id))) continue;
        const p = screen(id), vx = p.x - origin.x, vy = p.y - origin.y;
        const along = vx * dir[0] + vy * dir[1];
        if (along <= 4) continue;
        const across = Math.abs(vx * dir[1] - vy * dir[0]);
        // Prefer what is straight ahead; sideways drift costs twice as much as distance.
        const score = along + 2 * across;
        if (score < bestScore) { bestScore = score; best = id; }
      }
      if (best) onSelectRef.current(best);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
