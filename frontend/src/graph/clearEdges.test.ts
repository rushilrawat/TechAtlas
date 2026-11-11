import { describe, expect, it } from "vitest";
import graph from "../../public/api/v1/graph.json";
import { selectClearEdges } from "./clearEdges";
import type { GraphResponse } from "../api/types";

// Repo X-Ray Universe uses this clear subset; Explore reads the generator's edge tiers.
describe("clear scan connections", () => {
  it("selects a deterministic sparse set of genuine edges", () => {
    const data = graph as GraphResponse;
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
