import { describe, expect, it } from "vitest";
import { ROLES, cycleStatus, nextUp, readRole, resolveRole, roleProgress, writeRole } from "./roles";
import { realGraph } from "../test/realGraph";

const graph = realGraph();
const slugs = new Set(graph.nodes.map((n) => n.slug));

describe("roles data", () => {
  it("every role node exists in the atlas", () => {
    const missing = ROLES.flatMap((r) => r.stages.flatMap((s) => s.nodes.filter((n) => !slugs.has(n)).map((n) => `${r.id}: ${n}`)));
    expect(missing).toEqual([]);
  });
  it("ids are unique, stages are non-empty and no node repeats within a role", () => {
    expect(new Set(ROLES.map((r) => r.id)).size).toBe(ROLES.length);
    for (const r of ROLES) {
      expect(r.stages.length).toBeGreaterThanOrEqual(3);
      const all = r.stages.flatMap((s) => s.nodes);
      expect(new Set(all).size, r.id).toBe(all.length);
      for (const s of r.stages) expect(s.nodes.length).toBeGreaterThan(0);
    }
  });
  it("each role is connected enough to draw on the atlas", () => {
    for (const r of ROLES) {
      const res = resolveRole(r, graph);
      expect(res.edgeIds.length, r.id).toBeGreaterThanOrEqual(res.nodeIds.length / 2);
    }
  });
});

describe("role helpers", () => {
  const role = resolveRole(ROLES.find((r) => r.id === "backend-engineer")!, graph);
  it("tracks progress and the next node from the learning map", () => {
    const first = role.stages[0].ids[0];
    expect(nextUp(role, {})).toBe(first);
    const map = { [first]: "known" as const, [role.stages[0].ids[1]]: "learning" as const };
    expect(nextUp(role, map)).toBe(role.stages[0].ids[1]);
    expect(roleProgress(role.nodeIds, map)).toMatchObject({ known: 1, learning: 1, goal: 0, total: role.nodeIds.length });
  });
  it("cycles status", () => {
    expect(cycleStatus(undefined)).toBe("learning");
    expect(cycleStatus("goal")).toBe("learning");
    expect(cycleStatus("learning")).toBe("known");
    expect(cycleStatus("known")).toBeNull();
  });
  it("round-trips through the URL and rejects unknown roles", () => {
    expect(readRole(writeRole("?node=x", "ml-engineer"))).toBe("ml-engineer");
    expect(readRole("?role=nope")).toBeNull();
    expect(writeRole("?role=ml-engineer&a=1", null)).toBe("a=1");
  });
});
