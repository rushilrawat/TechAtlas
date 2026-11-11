import { describe, expect, it } from "vitest";
import graph from "../../public/api/v1/graph.json";
import { selectClearEdges } from "./clearEdges";
import type { GraphResponse } from "../api/types";

describe("clear atlas connections", () => {
  it("selects a deterministic sparse set of genuine overview edges", () => {
    const data = graph as GraphResponse;
    const a = selectClearEdges(data, 8, 120, false, 14);
    const b = selectClearEdges(data, 8, 120, false, 14);
    expect([...a]).toEqual([...b]);
    expect(a.size).toBeGreaterThanOrEqual(70);
    expect(a.size).toBeLessThanOrEqual(110);
    expect([...a].every((id) => data.edges.some((edge) => edge.id === id))).toBe(true);
    const nodes = new Map(data.nodes.map((node) => [node.id, node]));
    const bridgePairs = new Set(data.edges.filter((edge) => a.has(edge.id))
      .filter((edge) => nodes.get(edge.source)?.primary_domain !== nodes.get(edge.target)?.primary_domain)
      .map((edge) => [nodes.get(edge.source)?.primary_domain, nodes.get(edge.target)?.primary_domain].sort().join("|")));
    expect(bridgePairs.size).toBeGreaterThanOrEqual(5);
  });
});
