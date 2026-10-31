import { describe, expect, it } from "vitest";
import { buildGraph, domainMemberIds } from "./buildGraph";
import type { GraphResponse } from "../api/types";

// Count/highlight correctness (redesign §13/§36/§37): the set highlighted when a domain is
// focused MUST equal the domain's member set as counted in the sidebar (nodes whose
// primary_domain is that domain). This guards against the earlier bug where focusing a
// domain lit only its edge-neighbours (a small subset) while the count claimed the full set.
function node(id: string, domain: string, type: "domain" | "concept" | "technology") {
  return { id, slug: id.split(":")[1], label: id, node_type: type,
    node_subtype: null, primary_domain: domain, x: 0, y: 0, cluster: domain,
    size: 8, color: "#fff" };
}

const fixture: GraphResponse = {
  version: "0.4.0", layout_version: "0.4.0",
  nodes: [
    node("domain:robotics", "domain:robotics", "domain"),
    node("domain:ai-ml", "domain:ai-ml", "domain"),
    // 3 robotics members, only ONE of which has an edge to the anchor
    node("technology:ros2", "domain:robotics", "technology"),
    node("concept:slam", "domain:robotics", "concept"),
    node("concept:motion-planning", "domain:robotics", "concept"),
    // an ai-ml member that happens to edge-link to robotics (cross-domain)
    node("concept:reinforcement-learning", "domain:ai-ml", "concept"),
  ],
  edges: [
    // only ros2 is edge-joined to the robotics anchor; RL is cross-domain
    { id: "e0", source: "technology:ros2", target: "domain:robotics", relationship_type: "belongs_to_domain", weight: 1 },
    { id: "e1", source: "concept:reinforcement-learning", target: "domain:robotics", relationship_type: "related_to", weight: 1 },
  ],
};

describe("domainMemberIds (count/highlight correctness)", () => {
  const g = buildGraph(fixture);

  it("includes EVERY node whose primary_domain is the domain, plus the anchor", () => {
    const m = domainMemberIds(g, "domain:robotics");
    expect(m).toEqual(new Set([
      "technology:ros2", "concept:slam", "concept:motion-planning",
    ]));
  });

  it("matches the sidebar count definition (count of primary_domain members)", () => {
    const roboticsCount = fixture.nodes.filter(
      (n) => n.node_type !== "domain" && n.primary_domain === "domain:robotics",
    ).length; // = 3, the sidebar's node_count
    const members = domainMemberIds(g, "domain:robotics");
    // members-only set (no anchor) equals the sidebar count exactly.
    expect(members.size).toBe(roboticsCount);
  });

  it("does NOT highlight only edge-neighbours (the old bug)", () => {
    const m = domainMemberIds(g, "domain:robotics");
    // slam + motion-planning have NO edge to the anchor but MUST be included
    expect(m.has("concept:slam")).toBe(true);
    expect(m.has("concept:motion-planning")).toBe(true);
    // a cross-domain edge-neighbour (RL, primary_domain ai-ml) must NOT be a robotics member
    expect(m.has("concept:reinforcement-learning")).toBe(false);
  });
});
