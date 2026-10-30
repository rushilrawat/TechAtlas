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

  return graph;
}
