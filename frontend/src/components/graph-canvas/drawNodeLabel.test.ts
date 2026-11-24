import { describe, expect, it } from "vitest";
import { placeLabel } from "./drawNodeLabel";

describe("placeLabel", () => {
  it("puts a label right of its node by default", () => {
    const spot = placeLabel(100, 100, 5, 40, 12, []);
    expect(spot!.tx).toBe(109);
  });
  it("moves to the left when the right side is taken", () => {
    const right = placeLabel(100, 100, 5, 40, 12, [])!;
    const spot = placeLabel(100, 100, 5, 40, 12, [right])!;
    expect(spot.tx).toBeLessThan(100);
  });
  it("never runs off the canvas edge", () => {
    const spot = placeLabel(40, 100, 5, 50, 12, [], { w: 100, h: 200 });
    expect(spot!.x0).toBeGreaterThanOrEqual(0);
    expect(spot!.x1).toBeLessThanOrEqual(100);
  });
  it("gives up (null) when nothing fits", () => {
    expect(placeLabel(10, 10, 5, 500, 12, [], { w: 100, h: 100 })).toBeNull();
  });
});
