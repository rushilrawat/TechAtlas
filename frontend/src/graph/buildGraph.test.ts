import { describe, expect, it } from "vitest";
import { buildGraph } from "./buildGraph";
import type { GraphResponse } from "../api/types";

const fixture: GraphResponse = {
  version: "0.1.0",
  layout_version: "0.1.0",
  nodes: [
    {
      id: "technology:react",
      slug: "react",
      label: "React",
      node_type: "technology",
      node_subtype: "library",
      primary_domain: "domain:frontend",
      x: 1,
      y: 2,
      cluster: "domain:frontend",
      size: 10,
      color: "#7aa2f7",
    },
    {
      id: "technology:javascript",
      slug: "javascript",
      label: "JavaScript",
      node_type: "technology",
      node_subtype: "programming_language",
      primary_domain: "domain:frontend",
      x: 3,
      y: 4,
      cluster: "domain:frontend",
      size: 12,
      color: "#7aa2f7",
    },
  ],
  edges: [
    {
      id: "e0",
      source: "technology:react",
      target: "technology:javascript",
      relationship_type: "written_in",
      weight: null,
    },
  ],
};

describe("buildGraph", () => {
  it("creates nodes with coordinates and attributes", () => {
    const g = buildGraph(fixture);
    expect(g.order).toBe(2);
    expect(g.getNodeAttribute("technology:react", "x")).toBe(1);
    expect(g.getNodeAttribute("technology:react", "label")).toBe("React");
    expect(g.getNodeAttribute("technology:react", "nodeType")).toBe("technology");
  });

  it("creates edges between existing nodes", () => {
    const g = buildGraph(fixture);
    expect(g.size).toBe(1);
    expect(g.hasEdge("e0")).toBe(true);
    expect(g.getEdgeAttribute("e0", "relationshipType")).toBe("written_in");
  });

  it("skips edges whose endpoints are missing", () => {
    const broken: GraphResponse = {
      ...fixture,
      edges: [
        {
          id: "bad",
          source: "technology:react",
          target: "technology:ghost",
          relationship_type: "related_to",
          weight: null,
        },
      ],
    };
    const g = buildGraph(broken);
    expect(g.size).toBe(0);
  });
});
