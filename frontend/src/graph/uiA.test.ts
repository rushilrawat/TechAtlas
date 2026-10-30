import { describe, it, expect } from "vitest";
import { buildGraph, BASE_EDGE_COLOR } from "./buildGraph";
import { buildOverlay } from "./scanOverlay";
import { labelPriority, selectPersistentLabels, LABEL_BUDGET } from "./semanticZoom";
import { computeFit } from "./cameraFit";
import type { GraphResponse, RepoScan } from "../api/types";

function alpha(rgba: string): number {
  const m = rgba.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)/);
  return m ? parseFloat(m[1]) : 1;
}

const G: GraphResponse = {
  version: "0.3.0",
  nodes: [
    { id: "technology:a", slug: "a", label: "A", node_type: "technology", x: 0, y: 0, size: 10, color: "#aaa", primary_domain: "domain:x" },
    { id: "technology:b", slug: "b", label: "B", node_type: "technology", x: 2, y: 2, size: 8, color: "#bbb", primary_domain: "domain:x" },
    { id: "technology:c", slug: "c", label: "C", node_type: "technology", x: 4, y: 0, size: 6, color: "#ccc", primary_domain: "domain:x" },
  ] as never,
  edges: [
    { id: "e0", source: "technology:a", target: "technology:b", relationship_type: "related_to" },
    { id: "e1", source: "technology:b", target: "technology:c", relationship_type: "related_to" },
  ] as never,
};

describe("UI-A: quiet background edges (R1, P1)", () => {
  it("base edge alpha is within the 0.04-0.10 band", () => {
    expect(alpha(BASE_EDGE_COLOR)).toBeGreaterThanOrEqual(0.04);
    expect(alpha(BASE_EDGE_COLOR)).toBeLessThanOrEqual(0.10);
  });
  it("build preserves every base edge and adds none", () => {
    const g = buildGraph(G);
    expect(g.size).toBe(G.edges.length);
  });
});

describe("UI-A: overlay edge integrity (R4, P1)", () => {
  const scan = {
    detections: [
      { node_id: "technology:a", detection_status: "confirmed" },
      { node_id: "technology:b", detection_status: "declared" },
    ],
  } as unknown as RepoScan;
  const ov = buildOverlay(scan, G);
  it("both-detected edge is verified", () => {
    expect(ov.highlightEdges.has("e0")).toBe(true);
  });
  it("one-detected edge is contextual, not verified", () => {
    expect(ov.contextualEdges.has("e1")).toBe(true);
    expect(ov.highlightEdges.has("e1")).toBe(false);
  });
  it("never includes an edge id absent from the base graph", () => {
    for (const id of [...ov.highlightEdges, ...ov.contextualEdges]) {
      expect(["e0", "e1"]).toContain(id);
    }
  });
  it("omits a detection whose node is absent, creating no node", () => {
    const s2 = { detections: [{ node_id: "technology:ghost", detection_status: "confirmed" }] } as unknown as RepoScan;
    const o2 = buildOverlay(s2, G);
    expect(o2.detectedNodes.size).toBe(0);
  });
});

describe("UI-A: label priority + bounded deterministic selection (R5, R6, P6)", () => {
  const ctx = { selectedId: "technology:b", hoveredId: "technology:c",
    statusByNode: new Map([["technology:a", "confirmed"], ["technology:b", "declared"], ["technology:c", "inferred"]] as never),
    sizeById: new Map([["technology:a", 10], ["technology:b", 8], ["technology:c", 6]]) };
  it("selected outranks hovered outranks confirmed", () => {
    expect(labelPriority("technology:b", ctx as never)).toBeGreaterThan(labelPriority("technology:c", ctx as never));
    expect(labelPriority("technology:c", ctx as never)).toBeGreaterThan(labelPriority("technology:a", ctx as never));
  });
  it("selection is bounded by the budget", () => {
    const many = Array.from({ length: 100 }, (_, i) => `technology:n${i}`);
    const c2 = { selectedId: null, hoveredId: null,
      statusByNode: new Map(many.map((id) => [id, "confirmed"] as const)) as never,
      sizeById: new Map(many.map((id, i) => [id, i] as const)) };
    const sel = selectPersistentLabels(many, c2 as never);
    expect(sel.size).toBeLessThanOrEqual(LABEL_BUDGET);
  });
  it("equal priority+popularity ties break by ascending node-id (deterministic)", () => {
    const ids = ["technology:z", "technology:a", "technology:m"];
    const c3 = { selectedId: null, hoveredId: null,
      statusByNode: new Map(ids.map((id) => [id, "confirmed"] as const)) as never,
      sizeById: new Map(ids.map((id) => [id, 5] as const)) };
    const sel = selectPersistentLabels(ids, c3 as never, 2);
    // lowest two node-ids retained
    expect(sel.has("technology:a")).toBe(true);
    expect(sel.has("technology:m")).toBe(true);
    expect(sel.has("technology:z")).toBe(false);
  });
});

describe("UI-A: camera fit (R11, R12)", () => {
  const full = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  it("returns null when bounds are null (skip fit)", () => {
    expect(computeFit({ bounds: null, fullSpread: full, sidebarWidthPx: 400, viewportWidthPx: 1440, minRatio: 0.12, universeRatio: 1.1 })).toBeNull();
  });
  it("ratio stays within clamp bounds", () => {
    const f = computeFit({ bounds: { minX: 4, minY: 4, maxX: 6, maxY: 6 }, fullSpread: full, sidebarWidthPx: 0, viewportWidthPx: 1440, minRatio: 0.12, universeRatio: 1.1 })!;
    expect(f.ratio).toBeGreaterThanOrEqual(0.12);
    expect(f.ratio).toBeLessThanOrEqual(1.1);
  });
  it("non-zero sidebar shifts center left vs zero sidebar", () => {
    const base = { bounds: { minX: 4, minY: 4, maxX: 6, maxY: 6 }, fullSpread: full, viewportWidthPx: 1440, minRatio: 0.12, universeRatio: 1.1 };
    const noBar = computeFit({ ...base, sidebarWidthPx: 0 })!;
    const withBar = computeFit({ ...base, sidebarWidthPx: 400 })!;
    expect(withBar.x).toBeLessThan(noBar.x);
  });
});
