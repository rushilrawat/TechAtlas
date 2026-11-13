import { describe, expect, it } from "vitest";
import { suggestNext } from "./learning";

const graph = {
  nodes: [
    { id: "technology:js", node_type: "technology" },
    { id: "technology:ts", node_type: "technology" },
    { id: "technology:react", node_type: "technology" },
    { id: "technology:next", node_type: "technology" },
    { id: "domain:frontend", node_type: "domain" },
  ],
  edges: [
    { source: "technology:ts", target: "technology:js", relationship_type: "built_on" },
    { source: "technology:react", target: "technology:js", relationship_type: "written_in" },
    { source: "technology:next", target: "technology:react", relationship_type: "built_on" },
    { source: "technology:js", target: "domain:frontend", relationship_type: "belongs_to_domain" },
  ],
};

describe("suggestNext", () => {
  it("suggests unmarked neighbours of what you know, never domains", () => {
    const ids = suggestNext({ "technology:js": "known" }, graph).map((s) => s.id);
    expect(ids.sort()).toEqual(["technology:react", "technology:ts"]);
  });

  it("leans toward a goal", () => {
    const top = suggestNext({ "technology:js": "known", "technology:next": "goal" }, graph)[0];
    expect(top.id).toBe("technology:react");
  });

  it("is empty with nothing marked", () => {
    expect(suggestNext({}, graph)).toEqual([]);
  });
});
