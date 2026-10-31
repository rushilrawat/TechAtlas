// Converts the API graph payload into a Graphology graph ready for Sigma.
// Uses the precomputed layout coordinates from the backend (spec §5.2) rather than
// running a physics simulation in the browser.

import Graph from "graphology";
import type { GraphResponse, NodeType } from "../api/types";

// Phase 1.5 UI-A: quiet background edges. The base graph must read as a calm map, not a
// bright spiderweb, so unpromoted edges sit in the 0.04-0.10 opacity band (per-state
// reducers in GraphCanvas promote the relevant ones). See design LLD.
export const BASE_EDGE_SIZE = 0.4;
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
      size: n.size,
      color: n.color,
      nodeType: n.node_type,
      nodeSubtype: n.node_subtype,
      primaryDomain: n.primary_domain,
      slug: n.slug,
      cluster: n.cluster,
      type: TYPE_TO_SHAPE[n.node_type],
      // domains get a visible border to read as anchors
      borderColor: n.node_type === "domain" ? "#ffffff" : n.color,
    });
  }

  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
    const key = e.id;
    if (graph.hasEdge(key)) continue;
    graph.addEdgeWithKey(key, e.source, e.target, {
      relationshipType: e.relationship_type,
      size: BASE_EDGE_SIZE,
      color: BASE_EDGE_COLOR,
    });
  }

  // ---- Overview LOD aggregate markers (atlas-overview-collision-free) ----
  // Additive presentation nodes. The canonical 607 nodes + 1116 edges above are built
  // exactly as before; markers are EXTRA nodes tagged `isAggregate` so Sigma's node
  // program, hit-testing, label, and click plumbing are reused with no new render program.
  // Markers start HIDDEN — the GraphCanvas render layer decides responsively (from live
  // screen-space fit) when a marker REPLACES its members. A marker is never a canonical
  // node or relationship; its id is namespaced `agg:` and it carries the exact member ids.
  for (const agg of data.overview_aggregates ?? []) {
    const anchorColor = graph.hasNode(agg.domain_id)
      ? (graph.getNodeAttribute(agg.domain_id, "color") as string)
      : "#9aa5ce";
    for (const m of agg.markers) {
      if (graph.hasNode(m.id)) continue;
      graph.addNode(m.id, {
        label: "",            // label is composed at render time (name + count)
        x: m.x,
        y: m.y,
        // Render radius hint; the render layer rescales against live screen space.
        size: Math.max(12, Math.min(34, Math.sqrt(m.count) * 6)),
        color: anchorColor,
        nodeType: "aggregate",
        primaryDomain: agg.domain_id,
        type: "circle",
        borderColor: anchorColor,
        isAggregate: true,
        domainId: agg.domain_id,
        memberIds: [...m.member_ids],
        count: m.count,
        // start hidden: the overview render logic unhides markers for collapsed sectors.
        hidden: true,
      });
    }
  }

  return graph;
}

/**
 * All canonical member ids represented by a domain's overview aggregate markers — the
 * union across that domain's markers. Mirrors `domainMemberIds` but sourced from the
 * precomputed LOD groupings, so a collapsed sector hides exactly these member nodes.
 */
export function aggregateMemberIds(graph: Graph, domainId: string): Set<string> {
  const set = new Set<string>();
  graph.forEachNode((_nid, a) => {
    if (a.isAggregate === true && a.domainId === domainId) {
      for (const m of (a.memberIds as string[] | undefined) ?? []) set.add(m);
    }
  });
  return set;
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
