// Pure filtering logic (Phase 1B, requirements 1.6–1.10), extracted so it can be
// unit-tested without a live Sigma instance. GraphCanvas applies the result via
// Sigma reducers (hiding nodes/edges) and NEVER recomputes coordinates.

import type { GraphResponse, NodeType } from "../api/types";

export interface FilterState {
  // Empty set means "no constraint on this dimension" (i.e. show all).
  nodeTypes: Set<NodeType>;
  domains: Set<string>; // domain ids, e.g. "domain:frontend"
  subtypes: Set<string>; // node_subtype values, e.g. "framework"
}

export interface VisibleSets {
  nodes: Set<string>; // visible node ids
  edges: Set<string>; // visible edge ids (both endpoints visible)
}

/** An empty filter: everything is visible. */
export function emptyFilter(): FilterState {
  return { nodeTypes: new Set(), domains: new Set(), subtypes: new Set() };
}

/** True when no dimension constrains anything, so the whole graph is visible. */
export function isEmptyFilter(f: FilterState): boolean {
  return f.nodeTypes.size === 0 && f.domains.size === 0 && f.subtypes.size === 0;
}

/**
 * Does a single node pass the filter? A domain node is kept whenever its own domain
 * is selected, so filtering by domain never hides the anchor of a visible cluster.
 */
function nodePasses(
  node: { id: string; node_type: NodeType; node_subtype: string | null; primary_domain: string },
  f: FilterState,
): boolean {
  if (f.nodeTypes.size > 0 && !f.nodeTypes.has(node.node_type)) return false;
  if (f.domains.size > 0) {
    // For a domain node, match on its own id; for others, match primary_domain.
    const domainId = node.node_type === "domain" ? node.id : node.primary_domain;
    if (!f.domains.has(domainId)) return false;
  }
  if (f.subtypes.size > 0) {
    // Subtype filter only constrains technologies (domains/concepts have no subtype).
    if (node.node_type === "technology") {
      if (!node.node_subtype || !f.subtypes.has(node.node_subtype)) return false;
    }
  }
  return true;
}

/**
 * Compute the visible node and edge id sets for a filter. Pure: depends only on the
 * payload and the filter, never on layout or Sigma. An edge is visible only when both
 * endpoints are visible. Coordinates are untouched (requirement 1.7).
 */
export function applyFilters(data: GraphResponse, f: FilterState): VisibleSets {
  const nodes = new Set<string>();
  for (const n of data.nodes) {
    if (nodePasses(n, f)) nodes.add(n.id);
  }
  const edges = new Set<string>();
  for (const e of data.edges) {
    if (nodes.has(e.source) && nodes.has(e.target)) edges.add(e.id);
  }
  return { nodes, edges };
}
