import { describe, expect, it } from "vitest";
import graph from "../../../data/graph.json";
import { JOURNEYS } from "./journeys";

describe("guided paths", () => {
  it("uses canonical nodes and real edges for every step", () => {
    const nodes = new Set(graph.nodes.map((node) => node.id));
    const edges = new Set(graph.edges.map((edge) => [edge.source, edge.target].sort().join("|")));
    for (const journey of JOURNEYS) {
      expect(journey.steps.length).toBeGreaterThan(1);
      for (const step of journey.steps) expect(nodes.has(step.id)).toBe(true);
      for (let i = 1; i < journey.steps.length; i++) {
        expect(edges.has([journey.steps[i - 1].id, journey.steps[i].id].sort().join("|"))).toBe(true);
      }
    }
  });
});
