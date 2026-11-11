import { describe, expect, it } from "vitest";
import graph from "../../public/api/v1/graph.json";
import { selectClearEdges } from "./clearEdges";
import type { GraphResponse } from "../api/types";

describe("clear atlas connections", () => {
  it("selects a deterministic sparse set of genuine overview edges", () => {
    const data = graph as GraphResponse;
    const a = selectClearEdges(data), b = selectClearEdges(data);
    expect([...a]).toEqual([...b]);
    expect(a.size).toBeGreaterThanOrEqual(14);
    expect(a.size).toBeLessThanOrEqual(28);
    expect([...a].every((id) => data.edges.some((edge) => edge.id === id))).toBe(true);
  });
});
