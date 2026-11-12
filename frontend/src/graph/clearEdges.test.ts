import { describe, expect, it } from "vitest";
import dataset from "../../../data/graph.json";
import layout from "../../../data/layout.json";
import { selectClearEdges } from "./clearEdges";
import type { GraphResponse } from "../api/types";

// Repo X-Ray Universe uses this clear subset; Explore reads the generator's edge tiers.
describe("clear scan connections", () => {
  it("selects a deterministic sparse set of genuine edges", () => {
    // Assemble the API shape from the committed dataset + layout (public/api is a build
    // output and does not exist when CI typechecks).
    const coords = layout.coordinates as Record<string, { x: number; y: number; ring: number }>;
    const data = {
      version: dataset.version, layout_version: layout.layout_version,
      nodes: dataset.nodes.map((n) => ({ id: n.id, slug: n.slug, label: n.name, node_type: n.node_type,
        node_subtype: null, primary_domain: n.primary_domain, x: coords[n.id].x, y: coords[n.id].y,
        cluster: n.primary_domain, ring: coords[n.id].ring, size: 3, color: "#888888" })),
      edges: dataset.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target,
        relationship_type: e.relationship_type, weight: null })),
      edge_tiers: layout.edge_tiers as Record<string, string>,
    } as GraphResponse;
    const a = selectClearEdges(data, 12, 150, true, 10);
    const b = selectClearEdges(data, 12, 150, true, 10);
    expect([...a]).toEqual([...b]);
    expect(a.size).toBeGreaterThanOrEqual(40);
    expect(a.size).toBeLessThanOrEqual(150);
    expect([...a].every((id) => data.edges.some((edge) => edge.id === id))).toBe(true);
    const nodes = new Map(data.nodes.map((node) => [node.id, node]));
    const bridgePairs = new Set(data.edges.filter((edge) => a.has(edge.id))
      .filter((edge) => nodes.get(edge.source)?.primary_domain !== nodes.get(edge.target)?.primary_domain)
      .map((edge) => [nodes.get(edge.source)?.primary_domain, nodes.get(edge.target)?.primary_domain].sort().join("|")));
    expect(bridgePairs.size).toBeGreaterThanOrEqual(5);
  });
});
