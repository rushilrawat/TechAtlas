import { describe, expect, it } from "vitest";
import {
  accountForNodes,
  isOverviewEdgeHidden,
  sectorIsAggregatedAtOverview,
  STRUCTURAL_REL,
} from "./overviewLod";
import { RATIO_DOMAIN, RATIO_UNIVERSE } from "./semanticZoom";

const OVERVIEW = RATIO_UNIVERSE + 0.5; // band 0
const MID = (RATIO_UNIVERSE + RATIO_DOMAIN) / 2; // band 1
const DETAIL = RATIO_DOMAIN - 0.2; // band 2

describe("overview edge gate (Layer 2 — zero ordinary edges at rest)", () => {
  it("hides ALL ordinary edges at the overview band with no selection and no scan", () => {
    expect(isOverviewEdgeHidden({ ratio: OVERVIEW, activeId: null, inScan: false })).toBe(true);
    expect(isOverviewEdgeHidden({ ratio: MID, activeId: null, inScan: false })).toBe(true);
  });
  it("reveals edges the moment a node is selected/hovered (genuine relationships reappear)", () => {
    expect(isOverviewEdgeHidden({ ratio: OVERVIEW, activeId: "technology:react", inScan: false })).toBe(false);
  });
  it("does not own edge styling during Repo X-Ray", () => {
    expect(isOverviewEdgeHidden({ ratio: OVERVIEW, activeId: null, inScan: true })).toBe(false);
  });
  it("does not hide edges when zoomed into the detail band", () => {
    expect(isOverviewEdgeHidden({ ratio: DETAIL, activeId: null, inScan: false })).toBe(false);
  });
  it("classifies the structural membership spokes", () => {
    expect(STRUCTURAL_REL.has("belongs_to_domain")).toBe(true);
    expect(STRUCTURAL_REL.has("has_subdomain")).toBe(true);
    expect(STRUCTURAL_REL.has("depends_on")).toBe(false);
  });
});

describe("responsive sector aggregation (Layer 1 — replace, don't duplicate)", () => {
  const base = { domainId: "domain:robotics", inScan: false };
  it("aggregates dense sectors at the overview band with nothing selected", () => {
    expect(
      sectorIsAggregatedAtOverview({ ...base, ratio: OVERVIEW, activeId: null, activeDomainId: null }),
    ).toBe(true);
  });
  it("expands the selected domain to individual members (no aggregate stand-in)", () => {
    expect(
      sectorIsAggregatedAtOverview({
        ...base,
        ratio: OVERVIEW,
        activeId: "domain:robotics",
        activeDomainId: "domain:robotics",
      }),
    ).toBe(false);
  });
  it("keeps OTHER sectors aggregated when a different domain is selected", () => {
    expect(
      sectorIsAggregatedAtOverview({
        ...base,
        ratio: OVERVIEW,
        activeId: "domain:ai-ml",
        activeDomainId: "domain:ai-ml",
      }),
    ).toBe(true);
  });
  it("always shows individuals in the detail band (progressive disclosure on zoom)", () => {
    expect(
      sectorIsAggregatedAtOverview({ ...base, ratio: DETAIL, activeId: null, activeDomainId: null }),
    ).toBe(false);
  });
  it("never aggregates during Repo X-Ray", () => {
    expect(
      sectorIsAggregatedAtOverview({ ...base, ratio: OVERVIEW, activeId: null, activeDomainId: null, inScan: true }),
    ).toBe(false);
  });
});

describe("node-accounting invariant (Property 1 — nothing discarded)", () => {
  it("every canonical node is shown individually XOR aggregated, none missing or duplicated", () => {
    const all = Array.from({ length: 607 }, (_, i) => `n${i}`);
    // simulate: first 500 aggregated into sectors, last 107 shown individually
    const aggregated = all.slice(0, 500);
    const individual = all.slice(500);
    const r = accountForNodes({ allNodeIds: all, individuallyShown: individual, aggregatedMembers: aggregated });
    expect(r.total).toBe(607);
    expect(r.missing).toEqual([]);
    expect(r.duplicated).toEqual([]);
    expect(r.individual + r.aggregated).toBe(607);
  });
  it("detects a discarded node", () => {
    const all = ["a", "b", "c"];
    const r = accountForNodes({ allNodeIds: all, individuallyShown: ["a"], aggregatedMembers: ["b"] });
    expect(r.missing).toEqual(["c"]);
  });
  it("detects a node both shown and aggregated (double-count)", () => {
    const all = ["a", "b"];
    const r = accountForNodes({ allNodeIds: all, individuallyShown: ["a", "b"], aggregatedMembers: ["b"] });
    expect(r.duplicated).toEqual(["b"]);
  });
  it("the pre-fix baseline (all individual, zero aggregated) satisfies the invariant", () => {
    const all = Array.from({ length: 607 }, (_, i) => `n${i}`);
    const r = accountForNodes({ allNodeIds: all, individuallyShown: all, aggregatedMembers: [] });
    expect(r.missing).toEqual([]);
    expect(r.duplicated).toEqual([]);
    expect(r.individual).toBe(607);
    expect(r.aggregated).toBe(0);
  });
});

import { placeLabels, type LabelCandidate, type Box, type KeyedBox } from "./overviewLod";

describe("placeLabels (Layer 3 — collision-free priority labels)", () => {
  const vp = { w: 1000, h: 800 };
  const mk = (id: string, priority: number, box: Box): LabelCandidate => ({
    id, priority, box, ownerKey: id,
  });

  it("keeps all labels when none overlap", () => {
    const cands = [
      mk("a", 10, { x: 100, y: 100, w: 60, h: 14 }),
      mk("b", 10, { x: 300, y: 300, w: 60, h: 14 }),
    ];
    const sup = placeLabels({ candidates: cands, nodeBoxes: [], panels: [], viewport: vp });
    expect(sup.size).toBe(0);
  });

  it("drops the LOWER-priority label when two overlap", () => {
    const cands = [
      mk("low", 5, { x: 100, y: 100, w: 60, h: 14 }),
      mk("high", 20, { x: 110, y: 102, w: 60, h: 14 }),
    ];
    const sup = placeLabels({ candidates: cands, nodeBoxes: [], panels: [], viewport: vp });
    expect(sup.has("low")).toBe(true);
    expect(sup.has("high")).toBe(false);
  });

  it("suppresses a label that falls behind a side panel", () => {
    const panel: Box = { x: 0, y: 0, w: 200, h: 800 }; // left rail
    const cands = [mk("behind", 10, { x: 50, y: 100, w: 60, h: 14 })];
    const sup = placeLabels({ candidates: cands, nodeBoxes: [], panels: [panel], viewport: vp });
    expect(sup.has("behind")).toBe(true);
  });

  it("suppresses a label clipped by the viewport edge", () => {
    const cands = [mk("clip", 10, { x: 970, y: 100, w: 60, h: 14 })]; // x+w=1030 > 1000
    const sup = placeLabels({ candidates: cands, nodeBoxes: [], panels: [], viewport: vp });
    expect(sup.has("clip")).toBe(true);
  });

  it("suppresses a label overlapping another node's circle but not its own owner", () => {
    const owner: KeyedBox = { key: "x", x: 80, y: 100, w: 16, h: 16 };
    const other: KeyedBox = { key: "other", x: 105, y: 100, w: 16, h: 16 };
    const cand: LabelCandidate = {
      id: "x", priority: 10, box: { x: 100, y: 100, w: 40, h: 14 }, ownerKey: "x",
    };
    const sup = placeLabels({
      candidates: [cand], nodeBoxes: [owner, other], panels: [], viewport: vp,
    });
    expect(sup.has("x")).toBe(true);
  });

  it("does NOT suppress a label merely overlapping its OWN node circle", () => {
    const owner: KeyedBox = { key: "x", x: 95, y: 100, w: 16, h: 16 };
    const cand: LabelCandidate = {
      id: "x", priority: 10, box: { x: 100, y: 100, w: 40, h: 14 }, ownerKey: "x",
    };
    const sup = placeLabels({ candidates: [cand], nodeBoxes: [owner], panels: [], viewport: vp });
    expect(sup.has("x")).toBe(false);
  });

  it("is deterministic on ties (id ascending kept first)", () => {
    const cands = [
      mk("b", 10, { x: 100, y: 100, w: 60, h: 14 }),
      mk("a", 10, { x: 110, y: 102, w: 60, h: 14 }), // overlaps b
    ];
    const sup = placeLabels({ candidates: cands, nodeBoxes: [], panels: [], viewport: vp });
    // tie -> id "a" sorts first and is kept; "b" dropped
    expect(sup.has("b")).toBe(true);
    expect(sup.has("a")).toBe(false);
  });
});
