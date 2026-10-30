import { describe, expect, it } from "vitest";
import { applyFilters, emptyFilter, isEmptyFilter, type FilterState } from "./filters";
import type { GraphResponse, NodeType } from "../api/types";

function node(
  id: string,
  node_type: NodeType,
  primary_domain: string,
  node_subtype: string | null = null,
) {
  return {
    id,
    slug: id.split(":")[1],
    label: id,
    node_type,
    node_subtype,
    primary_domain,
    x: 0,
    y: 0,
    cluster: primary_domain,
    size: 5,
    color: "#fff",
  };
}

const data: GraphResponse = {
  version: "0.2.0",
  layout_version: "0.2.0",
  nodes: [
    node("domain:frontend", "domain", "domain:frontend"),
    node("domain:backend", "domain", "domain:backend"),
    node("technology:react", "technology", "domain:frontend", "library"),
    node("technology:vue", "technology", "domain:frontend", "framework"),
    node("technology:express", "technology", "domain:backend", "framework"),
    node("concept:virtual-dom", "concept", "domain:frontend"),
  ],
  edges: [
    { id: "e0", source: "technology:react", target: "domain:frontend", relationship_type: "belongs_to_domain", weight: null },
    { id: "e1", source: "technology:express", target: "domain:backend", relationship_type: "belongs_to_domain", weight: null },
    { id: "e2", source: "technology:react", target: "concept:virtual-dom", relationship_type: "implements", weight: null },
    { id: "e3", source: "technology:vue", target: "domain:frontend", relationship_type: "belongs_to_domain", weight: null },
  ],
};

function filter(partial: Partial<FilterState>): FilterState {
  return { ...emptyFilter(), ...partial };
}

describe("applyFilters", () => {
  it("empty filter shows everything", () => {
    const f = emptyFilter();
    expect(isEmptyFilter(f)).toBe(true);
    const { nodes, edges } = applyFilters(data, f);
    expect(nodes.size).toBe(data.nodes.length);
    expect(edges.size).toBe(data.edges.length);
  });

  it("filters by node type (technology only)", () => {
    const { nodes, edges } = applyFilters(
      data,
      filter({ nodeTypes: new Set<NodeType>(["technology"]) }),
    );
    expect(nodes.has("technology:react")).toBe(true);
    expect(nodes.has("domain:frontend")).toBe(false);
    expect(nodes.has("concept:virtual-dom")).toBe(false);
    // every edge here touches a domain or concept, so none survive type=technology
    expect(edges.size).toBe(0);
  });

  it("filters by domain (keeps the domain anchor and its members)", () => {
    const { nodes, edges } = applyFilters(
      data,
      filter({ domains: new Set(["domain:frontend"]) }),
    );
    expect(nodes.has("domain:frontend")).toBe(true);
    expect(nodes.has("technology:react")).toBe(true);
    expect(nodes.has("concept:virtual-dom")).toBe(true);
    expect(nodes.has("domain:backend")).toBe(false);
    expect(nodes.has("technology:express")).toBe(false);
    // e1 (express→backend) excluded; e0, e2, e3 kept
    expect(edges.has("e0")).toBe(true);
    expect(edges.has("e2")).toBe(true);
    expect(edges.has("e3")).toBe(true);
    expect(edges.has("e1")).toBe(false);
  });

  it("filters by subtype (only constrains technologies)", () => {
    const { nodes } = applyFilters(data, filter({ subtypes: new Set(["framework"]) }));
    // technologies must be framework; vue & express pass, react (library) does not
    expect(nodes.has("technology:vue")).toBe(true);
    expect(nodes.has("technology:express")).toBe(true);
    expect(nodes.has("technology:react")).toBe(false);
    // domains and concepts are unaffected by a subtype filter
    expect(nodes.has("domain:frontend")).toBe(true);
    expect(nodes.has("concept:virtual-dom")).toBe(true);
  });

  it("combines type + domain (AND semantics)", () => {
    const { nodes } = applyFilters(
      data,
      filter({
        nodeTypes: new Set<NodeType>(["technology"]),
        domains: new Set(["domain:frontend"]),
      }),
    );
    expect(nodes.has("technology:react")).toBe(true);
    expect(nodes.has("technology:vue")).toBe(true);
    expect(nodes.has("technology:express")).toBe(false); // wrong domain
    expect(nodes.has("domain:frontend")).toBe(false); // wrong type
    expect(nodes.has("concept:virtual-dom")).toBe(false); // wrong type
  });

  it("can produce an empty result", () => {
    const { nodes, edges } = applyFilters(
      data,
      filter({
        nodeTypes: new Set<NodeType>(["concept"]),
        domains: new Set(["domain:backend"]),
      }),
    );
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  it("does not mutate or depend on coordinates (no relayout)", () => {
    const before = data.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
    applyFilters(data, filter({ nodeTypes: new Set<NodeType>(["technology"]) }));
    const after = data.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
    expect(after).toEqual(before);
  });
});

// Composition with semantic zoom (requirement 1.9): a node is actually shown only if
// BOTH the filter allows it AND the zoom level would show it (logical AND, matching
// the GraphCanvas reducer). These are independent pure predicates; we verify the AND.
import { labelVisibleAtRatio } from "./semanticZoom";

describe("filter ∧ semantic-zoom composition", () => {
  const f: FilterState = { ...emptyFilter(), nodeTypes: new Set<NodeType>(["technology"]) };
  const { nodes } = applyFilters(data, f);

  it("filtered-out node stays hidden regardless of zoom", () => {
    // domain:frontend is filtered out (type=technology); even at universe zoom where
    // domains are normally shown, the AND makes it hidden.
    const filterAllows = nodes.has("domain:frontend");
    const zoomShows = labelVisibleAtRatio("domain", 20, 2.0); // universe band shows domains
    expect(filterAllows).toBe(false);
    expect(filterAllows && zoomShows).toBe(false);
  });

  it("filter-allowed node follows the zoom rule", () => {
    // technology:react passes the filter; whether its label shows still depends on zoom.
    const filterAllows = nodes.has("technology:react");
    expect(filterAllows).toBe(true);
    const atDetail = labelVisibleAtRatio("technology", 5, 0.3); // detail band: all labels
    const atUniverse = labelVisibleAtRatio("technology", 5, 2.0); // universe: small tech hidden
    expect(filterAllows && atDetail).toBe(true);
    expect(filterAllows && atUniverse).toBe(false);
  });
});
