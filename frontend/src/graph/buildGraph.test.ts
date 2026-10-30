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

// --- regression: multiple relationship types between the same node pair ---
// The real dataset has 7 node pairs carrying two edge types each (e.g. pandas
// -built_on-> numpy AND pandas -depends_on-> numpy). A single-edge graph throws
// on the second edge; buildGraph must keep both as distinct edges.
describe("buildGraph multi-edge handling", () => {
  const multi: GraphResponse = {
    version: "0.2.0",
    layout_version: "0.2.0",
    nodes: [
      {
        id: "technology:pandas", slug: "pandas", label: "pandas",
        node_type: "technology", node_subtype: "library",
        primary_domain: "domain:ai-ml", x: 0, y: 0, cluster: "domain:ai-ml",
        size: 8, color: "#bb9af7",
      },
      {
        id: "technology:numpy", slug: "numpy", label: "NumPy",
        node_type: "technology", node_subtype: "library",
        primary_domain: "domain:ai-ml", x: 1, y: 1, cluster: "domain:ai-ml",
        size: 8, color: "#bb9af7",
      },
    ],
    edges: [
      { id: "e0", source: "technology:pandas", target: "technology:numpy", relationship_type: "built_on", weight: null },
      { id: "e1", source: "technology:pandas", target: "technology:numpy", relationship_type: "depends_on", weight: null },
    ],
  };

  it("keeps both relationship types between the same pair", () => {
    const g = buildGraph(multi);
    expect(g.size).toBe(2);
    expect(g.hasEdge("e0")).toBe(true);
    expect(g.hasEdge("e1")).toBe(true);
    expect(g.getEdgeAttribute("e0", "relationshipType")).toBe("built_on");
    expect(g.getEdgeAttribute("e1", "relationshipType")).toBe("depends_on");
  });
});

// --- regression: the REAL committed dataset must build without throwing ---
// This is the test that would have caught the production graph crash: it feeds the
// actual data/graph.json edge topology (not a synthetic fixture) into buildGraph.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("buildGraph on the real dataset", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataPath = resolve(here, "../../../data/graph.json");

  it("builds every node and edge in data/graph.json without throwing", () => {
    expect(existsSync(dataPath)).toBe(true);
    const raw = JSON.parse(readFileSync(dataPath, "utf8")) as {
      version: string;
      nodes: { id: string; slug: string; name: string; node_type: string }[];
      edges: { source: string; target: string; relationship_type: string }[];
    };
    // Shape it like the API payload buildGraph consumes (label/size/color).
    const payload: GraphResponse = {
      version: raw.version,
      layout_version: raw.version,
      nodes: raw.nodes.map((n) => ({
        id: n.id,
        slug: n.slug,
        label: n.name,
        node_type: n.node_type as GraphResponse["nodes"][number]["node_type"],
        node_subtype: null,
        primary_domain: "domain:software-engineering",
        x: 0,
        y: 0,
        cluster: null,
        size: 5,
        color: "#888",
      })),
      edges: raw.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.source,
        target: e.target,
        relationship_type: e.relationship_type,
        weight: null,
      })),
    };
    const g = buildGraph(payload);
    expect(g.order).toBe(raw.nodes.length);
    // every edge survives (multi-edges preserved, none silently dropped)
    expect(g.size).toBe(raw.edges.length);
  });
});
