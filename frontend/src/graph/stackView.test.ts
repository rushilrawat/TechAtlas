import { describe, it, expect } from "vitest";
import { computeStackLayout, prominenceOf, type StackNodeInput } from "./stackLayout";

// View-transition + coordinate-stability invariants for Stack View (spec §9 tests).
// The projection is a pure function over detected inputs; GraphCanvas applies/reverts it
// at the view layer. These tests lock the properties the view relies on.

function n(id: string, dom: string, e: Partial<StackNodeInput> = {}): StackNodeInput {
  return { id, primaryDomain: dom, nodeType: "technology", status: "confirmed", size: 5, prominence: 5, ...e };
}

describe("Stack View invariants", () => {
  it("every detected node gets exactly one projected position (group assignment)", () => {
    const input = [n("t:a", "d:x"), n("t:b", "d:x"), n("t:c", "d:y"), n("t:d", "d:z")];
    const l = computeStackLayout(input);
    expect(l.positions.size).toBe(input.length);
    // each node appears in exactly one cluster
    const seen = new Set<string>();
    for (const c of l.clusters) for (const id of c.nodeIds) {
      expect(seen.has(id)).toBe(false); seen.add(id);
    }
    expect(seen.size).toBe(input.length);
  });

  it("projection is stable: repeated computation yields identical coordinates", () => {
    const input = Array.from({ length: 20 }, (_, i) => n(`t:${i}`, `d:${i % 4}`, { prominence: i % 7, size: i % 3 }));
    const a = computeStackLayout(input);
    const b = computeStackLayout(input);
    for (const [id, p] of a.positions) expect(b.positions.get(id)).toEqual(p);
    expect(a.clusters.map((c) => c.domainId)).toEqual(b.clusters.map((c) => c.domainId));
  });

  it("clusters never collapse to a single point (spacing preserved)", () => {
    const input = [n("t:a", "d:x"), n("t:b", "d:y"), n("t:c", "d:z")];
    const l = computeStackLayout(input);
    const xs = [...l.positions.values()].map((p) => p.x);
    const ys = [...l.positions.values()].map((p) => p.y);
    // different domains must occupy different positions
    expect(new Set(xs.map((x) => Math.round(x))).size + new Set(ys.map((y) => Math.round(y))).size)
      .toBeGreaterThan(2);
  });

  it("concepts (generic) rank below real technologies for prominence", () => {
    expect(prominenceOf("concept", null)).toBeLessThan(prominenceOf("technology", "framework"));
  });

  it("does not depend on input order (order-independent grouping)", () => {
    const base = [n("t:a", "d:x", { prominence: 9 }), n("t:b", "d:x", { prominence: 1 }), n("t:c", "d:y")];
    const shuffled = [base[2], base[0], base[1]];
    const a = computeStackLayout(base);
    const b = computeStackLayout(shuffled);
    for (const id of ["t:a", "t:b", "t:c"]) expect(a.positions.get(id)).toEqual(b.positions.get(id));
  });
});
