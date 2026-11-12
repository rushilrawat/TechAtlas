// Converts the API graph payload into a Graphology graph ready for Sigma.
// Uses the precomputed layout coordinates from the backend (spec §5.2) rather than
// running a physics simulation in the browser.

import Graph from "graphology";
import type { GraphResponse, NodeType } from "../api/types";

type Point = { x: number; y: number };

/**
 * Signed curvature for @sigma/edge-curve so the curve bows away from `ref`. The program
 * places its control point at mid + k * (-dy, dx) in y-up graph space.
 */
export function outwardCurvature(a: Point, b: Point, ref: Point, magnitude: number): number {
  const mx = (a.x + b.x) / 2 - ref.x, my = (a.y + b.y) / 2 - ref.y;
  return (-(b.y - a.y) * mx + (b.x - a.x) * my) >= 0 ? magnitude : -magnitude;
}

/** Point on the quadratic curve the edge program draws (graph space, t in [0, 1]). */
export function curvePoint(a: Point, b: Point, curvature: number, t: number): Point {
  const c = { x: (a.x + b.x) / 2 - (b.y - a.y) * curvature, y: (a.y + b.y) / 2 + (b.x - a.x) * curvature };
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

// Phase 1.5 UI-A: quiet background edges. The base graph must read as a calm map, not a
// bright spiderweb, so unpromoted edges sit in the 0.04-0.10 opacity band (per-state
// reducers in GraphCanvas promote the relevant ones). See design LLD.
export const BASE_EDGE_SIZE = 0.4;
const ROOT_DOMAIN = "domain:software-engineering"; // taxonomic root, not a nesting parent
export const BASE_EDGE_COLOR = "rgba(140,150,170,0.06)";

// Node-type shapes so classification is conveyed by form, not just color (a11y §14.2).
const TYPE_TO_SHAPE: Record<NodeType, string> = {
  domain: "circle",
  concept: "circle",
  technology: "circle",
};

export function buildGraph(data: GraphResponse): Graph {
  // multi:true so a node pair may carry more than one relationship type as
  // separate edges (e.g. pandas -built_on-> numpy AND pandas -depends_on-> numpy).
  // Each API edge has a unique id (e0, e1, ...), so edges stay individually keyed.
  const graph = new Graph({ multi: true, type: "mixed" });

  for (const n of data.nodes) {
    graph.addNode(n.id, {
      label: n.label,
      x: n.x ?? 0,
      y: n.y ?? 0,
      // Layout-computed drawn radius (px at the default fit); API size is the fallback.
      size: n.display_size ?? n.size,
      apiSize: n.size, // Repo X-Ray keeps the larger popularity-based sizing
      color: n.color,
      nodeType: n.node_type,
      nodeSubtype: n.node_subtype,
      primaryDomain: n.primary_domain,
      slug: n.slug,
      cluster: n.cluster,
      ring: n.ring ?? 0,
      type: TYPE_TO_SHAPE[n.node_type],
      // domains get a visible border to read as anchors
      borderColor: n.node_type === "domain" ? "#ffffff" : n.color,
    });
  }

  // Ecosystem (territory) of each node: a nested subdomain's members belong to their
  // top-level parent's ecosystem, exactly as the layout generator groups them.
  const parentOf = new Map<string, string>();
  for (const e of data.edges) {
    if (e.relationship_type === "has_subdomain" && e.source !== ROOT_DOMAIN) parentOf.set(e.target, e.source);
  }
  const territoryOf = (id: string): string => {
    let d = graph.getNodeAttribute(id, "cluster") as string;
    while (parentOf.has(d)) d = parentOf.get(d)!;
    return d;
  };

  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    const key = e.id;
    if (graph.hasEdge(key)) continue;
    graph.addEdgeWithKey(key, e.source, e.target, {
      relationshipType: e.relationship_type,
      size: BASE_EDGE_SIZE,
      color: BASE_EDGE_COLOR,
      tier: data.edge_tiers?.[key] ?? "TierD",
      crossDomain: territoryOf(e.source) !== territoryOf(e.target),
      type: "curved",
    });
  }

  // Deterministic curvature. Local curves bow away from their ecosystem's anchor and
  // cross-domain bridges bow away from the atlas center, so no curve sweeps through a
  // cluster core. Parallel canonical relationships fan out with growing offsets.
  const pairs = new Map<string, string[]>();
  graph.forEachEdge((key, _attrs, source, target) => {
    const pair = [source, target].sort().join("|");
    const group = pairs.get(pair) ?? [];
    group.push(key);
    pairs.set(pair, group);
  });
  for (const group of pairs.values()) {
    group.sort().forEach((key, index) => {
      const [s, t] = graph.extremities(key);
      const a = graph.getNodeAttributes(s), b = graph.getNodeAttributes(t);
      const cross = graph.getEdgeAttribute(key, "crossDomain") as boolean;
      const anchor = cross ? null : a.cluster === b.cluster ? (a.cluster as string) : territoryOf(s);
      const ref = anchor && graph.hasNode(anchor) ? graph.getNodeAttributes(anchor) : { x: 0, y: 0 };
      const base = (cross ? 0.18 : 0.22) + index * 0.12;
      graph.setEdgeAttribute(key, "curvature",
        outwardCurvature(a as Point, b as Point, ref as Point, base));
    });
  }

  return graph;
}

/**
 * All member node ids of a domain = every node whose `primaryDomain` is that domain, plus
 * the domain anchor itself. This is the SAME definition the sidebar count uses (count of
 * nodes with that primary_domain), so a domain-focus highlight set matches the count exactly
 * (redesign §13/§26/§36 — count/highlight correctness). Deterministic; order-independent.
 */
export function domainMemberIds(graph: Graph, domainId: string): Set<string> {
  // MEMBER nodes only (primary_domain === domain), excluding the domain anchor itself — the
  // same definition as the sidebar count, so a domain focus highlights exactly `count` nodes.
  // (The anchor is kept visually prominent separately as the active/selected node.)
  const set = new Set<string>();
  graph.forEachNode((nid, a) => {
    if (nid !== domainId && a.primaryDomain === domainId) set.add(nid);
  });
  return set;
}
