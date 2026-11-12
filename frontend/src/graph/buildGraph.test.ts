import { describe, expect, it } from "vitest";
import { buildGraph, curvePoint, outwardCurvature } from "./buildGraph";
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
    expect(g.getEdgeAttribute("e0", "tier")).toBe("TierD");
    expect(Math.abs(g.getEdgeAttribute("e0", "curvature"))).toBeGreaterThan(0.1);
  });

  it("copies ring and tier metadata without changing canonical topology", () => {
    const enriched: GraphResponse = {
      ...fixture,
      nodes: fixture.nodes.map((n, i) => ({ ...n, ring: i + 1 })),
      edge_tiers: { e0: "TierB" },
    };
    const g = buildGraph(enriched);
    expect(g.order).toBe(2);
    expect(g.size).toBe(1);
    expect(g.getNodeAttribute("technology:react", "ring")).toBe(1);
    expect(g.getEdgeAttribute("e0", "tier")).toBe("TierB");
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
    expect(g.getEdgeAttribute("e0", "curvature")).not.toBe(g.getEdgeAttribute("e1", "curvature"));
    expect(g.getEdgeAttribute("e0", "type")).toBe("curved");
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


// A stale API payload may still include legacy aggregate metadata. The radial atlas
// ignores it and builds only canonical nodes.
describe("legacy aggregate metadata", () => {
  it("does not add presentation marker nodes", () => {
    const legacy: GraphResponse = {
      ...fixture,
      overview_aggregates: [{ domain_id: "domain:frontend", markers: [
        { id: "agg:domain:frontend:all", x: 2, y: 3, radius: 40,
          member_ids: ["technology:react"], count: 1, direct_count: 1 },
      ] }],
    };
    const graph = buildGraph(legacy);
    expect(graph.order).toBe(2);
    expect(graph.hasNode("agg:domain:frontend:all")).toBe(false);
  });
});

describe("curved edge geometry", () => {
  it("bows curves away from the reference point", () => {
    const ref = { x: 0, y: 0 };
    for (const [a, b] of [[{ x: 10, y: 10 }, { x: 20, y: 0 }], [{ x: 20, y: 0 }, { x: 10, y: 10 }],
      [{ x: -10, y: -10 }, { x: -20, y: 5 }]]) {
      const k = outwardCurvature(a, b, ref, 0.2);
      const apex = curvePoint(a, b, k, 0.5);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(Math.hypot(apex.x, apex.y)).toBeGreaterThan(Math.hypot(mid.x, mid.y));
    }
  });

  it("uses the layout's drawn radius when present", () => {
    const g = buildGraph({ ...fixture, nodes: fixture.nodes.map((n) => ({ ...n, display_size: 3.2 })) });
    expect(g.getNodeAttribute("technology:react", "size")).toBe(3.2);
  });
});

describe("ecosystem membership of edges", () => {
  const node = (id: string, cluster: string, type: "domain" | "technology" = "technology") => ({
    id, slug: id, label: id, node_type: type, node_subtype: null, primary_domain: cluster,
    x: 0, y: 0, cluster, size: 3, color: "#888888",
  });
  const data = {
    version: "t", layout_version: "t",
    nodes: [node("domain:software-engineering", "domain:software-engineering", "domain"),
      node("domain:systems", "domain:systems", "domain"), node("domain:arch", "domain:arch", "domain"),
      node("t:a", "domain:systems"), node("t:b", "domain:arch"), node("t:c", "domain:software-engineering")],
    edges: [
      { id: "e0", source: "domain:systems", target: "domain:arch", relationship_type: "has_subdomain", weight: null },
      { id: "e1", source: "domain:software-engineering", target: "domain:systems", relationship_type: "has_subdomain", weight: null },
      { id: "e2", source: "t:a", target: "t:b", relationship_type: "related_to", weight: null },
      { id: "e3", source: "t:a", target: "t:c", relationship_type: "related_to", weight: null },
    ],
  } as GraphResponse;

  it("treats a nested subdomain as part of its parent ecosystem, not the taxonomic root's", () => {
    const g = buildGraph(data);
    expect(g.getEdgeAttribute("e2", "crossDomain")).toBe(false);
    expect(g.getEdgeAttribute("e3", "crossDomain")).toBe(true);
  });
});
