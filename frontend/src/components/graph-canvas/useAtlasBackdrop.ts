import { useEffect, useState } from "react";
import type { GraphResponse } from "../../api/types";
import { curvePoint } from "../../graph/buildGraph";
import { Obstacles, placeHeadings, type Heading } from "./headings";
import type { CanvasRefs } from "./refs";

export type Backdrop = {
  sectors: { id: string; color: string; cx: number; cy: number; r: number }[];
  headings: Heading[];
};

export function useAtlasBackdrop(refs: CanvasRefs, data: GraphResponse, domains: unknown, exploreNonce: number,
  stackPositions: unknown, scanStatusByNode: unknown, visibleNodes: unknown) {
  const { domainGeomRef, domainsRef, graphRef, scanStatusRef, selectedRef, sigmaRef, stackActiveRef, visibleNodesRef } = refs;
  // Explore atlas overlay: soft domain-sector backplates, projected
  // to screen coords and kept in sync with the camera. Purely decorative (pointer-events
  // none); never touches graph data. Each sector is centered on its domain anchor.
  const [backdrop, setBackdrop] = useState<Backdrop>({ sectors: [], headings: [] });

  // ---- Explore atlas backdrop: domain-sector backplates + centre identity ----
  // Decorative overlay only (pointer-events:none). Projects each domain's member-cluster
  // centroid/radius and the atlas centre to screen on every camera move, so the tinted
  // sectors and centre mark track pan/zoom without per-frame cost (recompute on 'updated').
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    // Graph-space territory per TOP-LEVEL domain, computed once: the anchor is the center
    // and the radius covers every member, nested subdomain constellations included.
    const doms = domainsRef.current;
    if (!doms || doms.length === 0) { setBackdrop({ sectors: [], headings: [] }); return; }
    const topLevel = doms.filter((d) => graph.hasNode(d.id) && graph.getNodeAttribute(d.id, "ring") === 0);
    if (!domainGeomRef.current) {
      const geom = new Map<string, { gx: number; gy: number; gr: number; hr: number }>();
      for (const d of topLevel) {
        const gx = graph.getNodeAttribute(d.id, "x") as number;
        const gy = graph.getNodeAttribute(d.id, "y") as number;
        const owned = new Set([d.id]);
        if (d.id !== "domain:software-engineering") {
          graph.forEachOutEdge(d.id, (_e, attrs, _s, t) => {
            if (attrs.relationshipType === "has_subdomain") owned.add(t);
          });
        }
        // Radius of the cluster's visible body: the 90th percentile member distance, so a
        // lone outlier does not push the heading (and the backplate) far from the cluster.
        const dists: number[] = [], own: number[] = [];
        graph.forEachNode((id, a) => {
          if (owned.has(a.cluster as string) || id === d.id) {
            const dist = Math.hypot((a.x as number) - gx, (a.y as number) - gy) + (a.size as number);
            dists.push(dist);
            if (a.cluster === d.id || id === d.id) own.push(dist);
          }
        });
        const p90 = (xs: number[]) => {
          xs.sort((a, b) => a - b);
          return xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))] : 0;
        };
        // The heading hugs the domain's own lobe; nested subdomain constellations (e.g.
        // Graphics inside Game Development) only widen the backplate, not the label ring.
        geom.set(d.id, { gx, gy, gr: p90(dists), hr: p90(own) || p90(dists) });
      }
      domainGeomRef.current = geom;
    }

    const project = () => {
      // Suppress the atlas backdrop entirely during Repo X-Ray (Stack View owns the canvas).
      if (stackActiveRef.current || scanStatusRef.current) { setBackdrop({ sectors: [], headings: [] }); return; }
      const geom = domainGeomRef.current!;
      let ax = 0, ay = 0;
      for (const g of geom.values()) { ax += g.gx / geom.size; ay += g.gy / geom.size; }
      const sectors: { id: string; color: string; cx: number; cy: number; r: number }[] = [];
      const headings: Heading[] = [];
      const vis = visibleNodesRef.current;
      // Ring-like when the composition's center is open (no ecosystem covers it).
      const ringLike = [...geom.values()].every((g) => Math.hypot(g.gx - ax, g.gy - ay) > g.gr * 1.5);
      for (const d of topLevel) {
        const g = geom.get(d.id);
        if (!g) continue;
        const c = renderer.graphToViewport({ x: g.gx, y: g.gy });
        const rim = renderer.graphToViewport({ x: g.gx + g.gr, y: g.gy });
        const r = Math.hypot(rim.x - c.x, rim.y - c.y);
        sectors.push({ id: d.id, color: d.color, cx: c.x, cy: c.y, r: r * 1.12 });
        if (vis && !vis.has(d.id)) continue;
        headings.push({ id: d.id, label: d.name, color: d.color, left: c.x, top: c.y, align: "box",
          disc: { x: c.x, y: c.y, r: r * (g.hr / (g.gr || 1)) } });
      }
      // What a heading must not cover: every drawn node and the curves currently shown.
      const obstacles = new Obstacles();
      graph.forEachNode((id, attrs) => {
        const dd = renderer.getNodeDisplayData(id);
        if (!dd || dd.hidden) return;
        const v = renderer.graphToViewport({ x: attrs.x as number, y: attrs.y as number });
        obstacles.add(v.x, v.y, renderer.scaleSize(dd.size), true, attrs.territory as string);
      });
      graph.forEachEdge((id, attrs, source, target) => {
        const shown = renderer.getEdgeDisplayData(id);
        if (!shown || shown.hidden) return;
        const a = graph.getNodeAttributes(source) as { x: number; y: number };
        const b = graph.getNodeAttributes(target) as { x: number; y: number };
        const owner = graph.getNodeAttribute(source, "territory") as string;
        for (let i = 1; i < 16; i++) {
          const v = renderer.graphToViewport(curvePoint(a, b, (attrs.curvature as number) ?? 0, i / 16));
          // A bridge belongs to both of its ecosystems: either one's name may sit on it.
          const other = graph.getNodeAttribute(target, "territory") as string;
          obstacles.add(v.x, v.y, 1, false, attrs.crossDomain ? `${owner}|${other}` : owner);
        }
      });
      setBackdrop({ sectors, headings: placeHeadings(headings, renderer.getContainer(), topLevel,
        selectedRef.current, obstacles, ringLike) });
    };
    // Re-project after every render: Sigma renders with the camera's final state, while
    // "updated" can be emitted mid-animation and leave headings on stale positions.
    project();
    renderer.on("afterRender", project);
    return () => { renderer.removeListener("afterRender", project); };
  }, [domains, data, exploreNonce, stackPositions, scanStatusByNode, visibleNodes]);
  return backdrop;
}
