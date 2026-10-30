// Converts the API graph payload into a Graphology graph ready for Sigma.
// Uses the precomputed layout coordinates from the backend (spec §5.2) rather than
// running a physics simulation in the browser.

import Graph from "graphology";
import type { GraphResponse, NodeType } from "../api/types";

// Node-type shapes so classification is conveyed by form, not just color (a11y §14.2).
const TYPE_TO_SHAPE: Record<NodeType, string> = {
  domain: "circle",
  concept: "circle",
  technology: "circle",
};

export function buildGraph(data: GraphResponse): Graph {
  const graph = new Graph({ multi: false, type: "mixed" });

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
      size: 0.6,
      color: "rgba(140,150,170,0.18)",
    });
  }

  return graph;
}
