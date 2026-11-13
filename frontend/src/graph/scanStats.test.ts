import { expect, it } from "vitest";
import type { DomainSummary, GraphNode, RepoScan } from "../api/types";
import { computeScanStats, pct, scanSummaryMarkdown } from "./scanStats";

const node = (id: string, type: GraphNode["node_type"], domain: string): GraphNode =>
  ({ id, slug: id.split(":")[1], label: id.split(":")[1], node_type: type, node_subtype: null, primary_domain: domain,
    x: 0, y: 0, cluster: null, size: 1, color: "#fff" });
const dom = (id: string, parent: string | null = null): DomainSummary =>
  ({ id, slug: id, name: id.replace("domain:", ""), short_description: "", color: "#123456", node_count: 0, parent_id: parent });

const nodes = new Map([
  ["technology:react", node("technology:react", "technology", "domain:frontend")],
  ["technology:verilog", node("technology:verilog", "technology", "domain:digital-design")],
  ["concept:spa", node("concept:spa", "concept", "domain:frontend")],
  ["concept:x", node("concept:x", "concept", "domain:frontend")],
]);
const domains = new Map([["domain:frontend", dom("domain:frontend")], ["domain:computer-engineering", dom("domain:computer-engineering")],
  ["domain:digital-design", dom("domain:digital-design", "domain:computer-engineering")]]);
const scan = {
  repository: { owner: "o", name: "r", url: "", default_branch: "main", commit_sha: "abcdef123", description: null, primary_language: null, stars: null },
  detections: [
    { node_id: "technology:react", node_type: "technology", role: "", detection_status: "declared", evidence_ids: [], component_paths: [], dependency_classification: "direct" },
    { node_id: "technology:verilog", node_type: "technology", role: "", detection_status: "confirmed", evidence_ids: [], component_paths: [] },
    { node_id: "concept:spa", node_type: "concept", role: "", detection_status: "inferred", evidence_ids: [], component_paths: [] },
  ],
  evidence: [{ id: "e", node_id: "technology:react", type: "dep", file_path: "web/package.json", description: "", detection_status: "declared", source_url: "", rule: "", scanner_version: "", line: null }],
  unmapped: [{ name: "left-pad", ecosystem: "npm", detection_status: "declared", evidence_ids: [] }],
  coverage: { files_inspected: 4 },
} as unknown as RepoScan;

it("rolls detections up to top-level fields and counts confidence", () => {
  const s = computeScanStats(scan, nodes, domains);
  expect(s.fields.map((f) => [f.id, f.count])).toEqual([["domain:frontend", 2], ["domain:computer-engineering", 1]]);
  expect(s.fieldsTouched).toBe(2);
  expect(s.fieldsTotal).toBe(2);
  expect(s.confidence).toEqual({ confirmed: 1, declared: 1, inferred: 1, related: 0 });
  expect(s.atlasCoverage).toBeCloseTo(3 / 4);
  expect(s.mappedShare).toBeCloseTo(2 / 3);
  expect(s.ecosystems).toEqual([{ name: "npm", count: 2 }]);
  expect(s.direct).toBe(1);
});

it("builds a pasteable summary", () => {
  const md = scanSummaryMarkdown(scan, computeScanStats(scan, nodes, domains), nodes, domains, "https://x");
  expect(md).toContain("## o/r");
  expect(md).toContain("- **frontend** (2): react, spa");
  expect(md).toContain("Explore it on the atlas: https://x");
  expect(pct(0.004)).toBe("<1%");
});
