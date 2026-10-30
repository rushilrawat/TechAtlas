import { describe, it, expect } from "vitest";
import { computeStackLayout, prominenceOf, type StackNodeInput } from "./stackLayout";

function n(id: string, dom: string, extra: Partial<StackNodeInput> = {}): StackNodeInput {
  return { id, primaryDomain: dom, nodeType: "technology", status: "confirmed",
    size: 5, prominence: 5, ...extra };
}

describe("stackLayout", () => {
  it("groups nodes by domain into clusters", () => {
    const layout = computeStackLayout([
      n("technology:react", "domain:frontend"),
      n("technology:vue", "domain:frontend"),
      n("technology:flask", "domain:backend"),
    ]);
    const byDom = new Map(layout.clusters.map((c) => [c.domainId, c.nodeIds]));
    expect(byDom.get("domain:frontend")!.sort()).toEqual(["technology:react", "technology:vue"]);
    expect(byDom.get("domain:backend")).toEqual(["technology:flask"]);
  });

  it("is deterministic — same input yields identical positions", () => {
    const input = [n("technology:a", "domain:x"), n("technology:b", "domain:y"), n("technology:c", "domain:x")];
    const l1 = computeStackLayout(input);
    const l2 = computeStackLayout(input);
    for (const id of ["technology:a", "technology:b", "technology:c"]) {
      expect(l1.positions.get(id)).toEqual(l2.positions.get(id));
    }
  });

  it("orders within a cluster by prominence desc then size desc then id", () => {
    const layout = computeStackLayout([
      n("technology:lowprom", "domain:x", { prominence: 2, size: 9 }),
      n("technology:framework", "domain:x", { prominence: 9, size: 3 }),
      n("technology:sameprom-b", "domain:x", { prominence: 5, size: 5 }),
      n("technology:sameprom-a", "domain:x", { prominence: 5, size: 5 }),
    ]);
    const order = layout.clusters[0].nodeIds;
    expect(order[0]).toBe("technology:framework");        // highest prominence first
    expect(order.indexOf("technology:sameprom-a"))
      .toBeLessThan(order.indexOf("technology:sameprom-b")); // id tiebreak a < b
    expect(order[order.length - 1]).toBe("technology:lowprom"); // lowest prominence last
  });

  it("assigns a position to every node and computes finite bounds", () => {
    const input = Array.from({ length: 12 }, (_, i) => n(`technology:n${i}`, `domain:d${i % 3}`));
    const layout = computeStackLayout(input);
    for (const x of input) expect(layout.positions.has(x.id)).toBe(true);
    const b = layout.bounds;
    for (const v of [b.minX, b.minY, b.maxX, b.maxY]) expect(Number.isFinite(v)).toBe(true);
    expect(b.maxX).toBeGreaterThanOrEqual(b.minX);
  });

  it("empty input yields no clusters and safe bounds", () => {
    const layout = computeStackLayout([]);
    expect(layout.clusters).toEqual([]);
    expect(Number.isFinite(layout.bounds.minX)).toBe(true);
  });

  it("prominenceOf ranks frameworks/languages above concepts and data formats", () => {
    expect(prominenceOf("technology", "framework")).toBeGreaterThan(prominenceOf("concept", null));
    expect(prominenceOf("technology", "programming_language")).toBeGreaterThan(prominenceOf("technology", "developer_tool"));
    expect(prominenceOf("technology", "database")).toBeGreaterThan(prominenceOf("concept", null));
    // generic concept (e.g. JSON, Operating Systems) ranks last
    expect(prominenceOf("concept", null)).toBeLessThan(prominenceOf("technology", "protocol"));
  });
});
