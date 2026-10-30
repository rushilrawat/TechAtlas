import { describe, expect, it } from "vitest";
import { buildOverlay, detectedBounds } from "./scanOverlay";
import type { GraphResponse, RepoScan } from "../api/types";

function node(id: string, x = 0, y = 0) {
  return {
    id, slug: id.split(":")[1], label: id, node_type: "technology" as const,
    node_subtype: null, primary_domain: "domain:frontend", x, y,
    cluster: null, size: 5, color: "#fff",
  };
}

const graph: GraphResponse = {
  version: "0.2.0", layout_version: "0.2.0",
  nodes: [node("technology:react", 0, 0), node("technology:nodejs", 10, 10),
          node("technology:ghost-not-detected", 99, 99)],
  edges: [
    { id: "e0", source: "technology:react", target: "technology:nodejs", relationship_type: "commonly_used_with", weight: null },
    { id: "e1", source: "technology:react", target: "technology:ghost-not-detected", relationship_type: "related_to", weight: null },
  ],
};

function scan(detections: RepoScan["detections"]): RepoScan {
  return {
    scan_id: "s", status: "completed", scanner_version: "1", mapping_version: "0.2.0",
    repository: { owner: "o", name: "r", url: "https://github.com/o/r",
      default_branch: "main", commit_sha: "abc", description: null,
      primary_language: null, stars: null },
    summary: { matched_technology_count: detections.length, matched_concept_count: 0, unmapped_package_count: 0 },
    coverage: { files_listed: 0, files_inspected: 0, manifests_inspected: 0,
      source_files_inspected: 0, files_skipped_limit: 0, tree_truncated: false, partial: false, notes: [] },
    detections, evidence: [], unmapped: [],
  };
}

describe("buildOverlay", () => {
  it("only emphasizes detected nodes that exist in the graph", () => {
    const s = scan([
      { node_id: "technology:react", node_type: "technology", role: "library", detection_status: "confirmed", evidence_ids: [], component_paths: [] },
      { node_id: "technology:nonexistent", node_type: "technology", role: "x", detection_status: "declared", evidence_ids: [], component_paths: [] },
    ]);
    const o = buildOverlay(s, graph);
    expect(o.statusByNode.get("technology:react")).toBe("confirmed");
    expect(o.statusByNode.has("technology:nonexistent")).toBe(false); // not in graph
    expect(o.detectedNodes.size).toBe(1);
  });

  it("highlights only existing edges BETWEEN two detected nodes (no invented edges)", () => {
    const s = scan([
      { node_id: "technology:react", node_type: "technology", role: "library", detection_status: "confirmed", evidence_ids: [], component_paths: [] },
      { node_id: "technology:nodejs", node_type: "technology", role: "runtime", detection_status: "declared", evidence_ids: [], component_paths: [] },
    ]);
    const o = buildOverlay(s, graph);
    // e0 (react<->nodejs) both detected -> highlight; e1 (react<->ghost) only one -> not
    expect(o.highlightEdges.has("e0")).toBe(true);
    expect(o.highlightEdges.has("e1")).toBe(false);
  });

  it("computes bounds over detected nodes' coordinates", () => {
    const s = scan([
      { node_id: "technology:react", node_type: "technology", role: "library", detection_status: "confirmed", evidence_ids: [], component_paths: [] },
      { node_id: "technology:nodejs", node_type: "technology", role: "runtime", detection_status: "declared", evidence_ids: [], component_paths: [] },
    ]);
    const b = detectedBounds(buildOverlay(s, graph), graph)!;
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});
