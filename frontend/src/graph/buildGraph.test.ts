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


// --- atlas-overview-collision-free: aggregate marker ingestion (Task 4) ---
describe("buildGraph overview-aggregate ingestion", () => {
  const withAggregates: GraphResponse = {
    version: "0.4.0",
    layout_version: "0.4.0",
    nodes: [
      { id: "domain:robotics", slug: "robotics", label: "Robotics", node_type: "domain",
        node_subtype: null, primary_domain: "domain:robotics", x: 0, y: 0,
        cluster: "domain:robotics", size: 26, color: "#e05cc8" },
      { id: "technology:ros", slug: "ros", label: "ROS", node_type: "technology",
        node_subtype: "library", primary_domain: "domain:robotics", x: 10, y: 10,
        cluster: "domain:robotics", size: 8, color: "#e05cc8" },
      { id: "technology:slam", slug: "slam", label: "SLAM", node_type: "technology",
        node_subtype: "library", primary_domain: "domain:robotics", x: 20, y: 20,
        cluster: "domain:robotics", size: 8, color: "#e05cc8" },
    ],
    edges: [],
    overview_aggregates: [
      { domain_id: "domain:robotics", markers: [
        { id: "agg:domain:robotics:0", x: 15, y: 15, radius: 40,
          member_ids: ["technology:ros", "technology:slam"], count: 2, direct_count: 2 },
      ] },
    ],
  };

  it("still builds all canonical nodes + edges unchanged", () => {
    const g = buildGraph(withAggregates);
    // 3 canonical nodes + 1 aggregate marker node
    expect(g.hasNode("domain:robotics")).toBe(true);
    expect(g.hasNode("technology:ros")).toBe(true);
    expect(g.hasNode("technology:slam")).toBe(true);
  });

  it("adds each marker as an isAggregate node carrying memberIds + count, hidden by default", () => {
    const g = buildGraph(withAggregates);
    expect(g.hasNode("agg:domain:robotics:0")).toBe(true);
    expect(g.getNodeAttribute("agg:domain:robotics:0", "isAggregate")).toBe(true);
    expect(g.getNodeAttribute("agg:domain:robotics:0", "count")).toBe(2);
    expect(g.getNodeAttribute("agg:domain:robotics:0", "directCount")).toBe(2);
    expect(g.getNodeAttribute("agg:domain:robotics:0", "memberIds")).toEqual([
      "technology:ros", "technology:slam",
    ]);
    // marker colour follows its domain anchor; positioned at its centroid
    expect(g.getNodeAttribute("agg:domain:robotics:0", "x")).toBe(15);
    expect(g.getNodeAttribute("agg:domain:robotics:0", "domainId")).toBe("domain:robotics");
    // hidden by default: the render layer decides when to show it
    expect(g.getNodeAttribute("agg:domain:robotics:0", "hidden")).toBe(true);
  });

  it("builds fine when overview_aggregates is absent (older payload)", () => {
    const g = buildGraph(fixture);
    expect(g.order).toBe(2); // no marker nodes added
  });

  it("union of marker memberIds references only real canonical member nodes", () => {
    const g = buildGraph(withAggregates);
    const members = g.getNodeAttribute("agg:domain:robotics:0", "memberIds") as string[];
    for (const id of members) expect(g.hasNode(id)).toBe(true);
  });
});

// aggregateMemberIds helper mirrors domainMemberIds for markers.
import { aggregateMemberIds } from "./buildGraph";
describe("aggregateMemberIds", () => {
  it("returns all member ids represented by a domain's markers", () => {
    const g = buildGraph({
      version: "0.4.0", layout_version: "0.4.0",
      nodes: [
        { id: "domain:x", slug: "x", label: "X", node_type: "domain", node_subtype: null,
          primary_domain: "domain:x", x: 0, y: 0, cluster: "domain:x", size: 20, color: "#fff" },
        { id: "technology:a", slug: "a", label: "A", node_type: "technology", node_subtype: "library",
          primary_domain: "domain:x", x: 1, y: 1, cluster: "domain:x", size: 8, color: "#fff" },
        { id: "technology:b", slug: "b", label: "B", node_type: "technology", node_subtype: "library",
          primary_domain: "domain:x", x: 2, y: 2, cluster: "domain:x", size: 8, color: "#fff" },
      ],
      edges: [],
      overview_aggregates: [
        { domain_id: "domain:x", markers: [
          { id: "agg:domain:x:0", x: 1, y: 1, radius: 10, member_ids: ["technology:a"], count: 1, direct_count: 1 },
          { id: "agg:domain:x:1", x: 2, y: 2, radius: 10, member_ids: ["technology:b"], count: 1, direct_count: 1 },
        ] },
      ],
    });
    expect(aggregateMemberIds(g, "domain:x")).toEqual(new Set(["technology:a", "technology:b"]));
  });
});
