import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RepoXrayPanel } from "./RepoXrayPanel";
import type { DomainSummary, GraphNode, RepoScan } from "../api/types";

afterEach(cleanup);

const nodesById = new Map<string, GraphNode>([
  ["technology:flask", { id: "technology:flask", slug: "flask", label: "Flask",
    node_type: "technology", node_subtype: "framework", primary_domain: "domain:backend",
    x: 0, y: 0, cluster: null, size: 8, color: "#4ade80" }],
  ["technology:pytest", { id: "technology:pytest", slug: "pytest", label: "pytest",
    node_type: "technology", node_subtype: "developer_tool", primary_domain: "domain:testing",
    x: 1, y: 1, cluster: null, size: 6, color: "#60a5fa" }],
  ["concept:ci-cd", { id: "concept:ci-cd", slug: "ci-cd", label: "CI/CD",
    node_type: "concept", node_subtype: null, primary_domain: "domain:cloud",
    x: 2, y: 2, cluster: null, size: 5, color: "#fbbf24" }],
]);
const domainsById = new Map<string, DomainSummary>([
  ["domain:backend", { id: "domain:backend", slug: "backend", name: "Backend Development", short_description: "", color: "#4ade80", node_count: 1 }],
  ["domain:testing", { id: "domain:testing", slug: "testing", name: "Testing & Developer Tooling", short_description: "", color: "#60a5fa", node_count: 1 }],
  ["domain:cloud", { id: "domain:cloud", slug: "cloud", name: "Cloud, DevOps & Infrastructure", short_description: "", color: "#fbbf24", node_count: 1 }],
]);

function scan(opts: Partial<{ partial: boolean; notes: string[]; unmapped: number }> = {}): RepoScan {
  const { partial = false, notes = [], unmapped = 0 } = opts;
  return {
    scan_id: "s", status: partial ? "partial" : "completed", scanner_version: "1.5c.1",
    mapping_version: "0.3.0",
    repository: { owner: "pallets", name: "flask", url: "https://github.com/pallets/flask",
      default_branch: "main", commit_sha: "abcdef1234567", description: "demo", primary_language: "Python", stars: 5 },
    summary: { matched_technology_count: 2, matched_concept_count: 1, unmapped_package_count: unmapped },
    coverage: { files_listed: 50, files_inspected: 30, manifests_inspected: 3, source_files_inspected: 20, files_skipped_limit: partial ? 5 : 0, tree_truncated: false, partial, notes },
    detections: [
      { node_id: "technology:flask", node_type: "technology", role: "framework", detection_status: "confirmed", evidence_ids: ["e1"], component_paths: [], dependency_classification: "direct" },
      { node_id: "technology:pytest", node_type: "technology", role: "developer_tool", detection_status: "confirmed", evidence_ids: ["e2"], component_paths: [] },
      { node_id: "concept:ci-cd", node_type: "concept", role: "engineering_concept", detection_status: "inferred", evidence_ids: ["e3"], component_paths: [] },
    ],
    evidence: [],
    unmapped: Array.from({ length: unmapped }, (_, i) => ({ name: `pkg-${i}`, ecosystem: i % 2 ? "pypi" : "npm", detection_status: "declared" as const, evidence_ids: [] })),
  };
}

const noop = () => {};
function base(overrides = {}) {
  return { phase: { kind: "idle" } as const, onAnalyze: noop, onExit: noop, onAnalyzeAnother: noop, onFocusStack: noop, onFocusNode: noop, nodesById, domainsById, view: "stack" as const, onViewChange: noop, ...overrides };
}

describe("RepoXrayPanel UI-B hierarchy", () => {
  it("renders source-backed summary metrics (R16)", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan({ unmapped: 3 }) } })} />);
    const metrics = screen.getByLabelText("Scan summary");
    expect(within(metrics).getByText("2")).toBeTruthy();   // technologies
    expect(within(metrics).getByText("1")).toBeTruthy();   // concepts
    expect(within(metrics).getByText("3")).toBeTruthy();   // unmapped
  });

  it("shows Focus on Stack as the primary action (R17)", () => {
    const onFocusStack = vi.fn();
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan() }, onFocusStack })} />);
    const btn = screen.getByRole("button", { name: "Focus on Stack" });
    expect(btn.className).toContain("primary");
    fireEvent.click(btn);
    expect(onFocusStack).toHaveBeenCalled();
  });

  it("splits tools from concepts, presentation-only, all detections present (R18, P9)", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan() } })} />);
    expect(screen.getByText("Technologies & tools")).toBeTruthy();
    expect(screen.getByText("Engineering concepts")).toBeTruthy();
    // every detection appears exactly once
    expect(screen.getByRole("button", { name: /Flask/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /pytest/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /CI\/CD/ })).toBeTruthy();
  });

  it("renders a classification badge only when present (R19, P10)", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan() } })} />);
    // Flask has dependency_classification "direct"; pytest has none.
    const flask = screen.getByRole("button", { name: /Flask/ });
    expect(within(flask).getByText("direct")).toBeTruthy();
    const pytest = screen.getByRole("button", { name: /pytest/ });
    expect(within(pytest).queryByText(/direct|transitive|undetermined/)).toBeNull();
  });

  it("always shows the partial banner with coverage notes when partial (R23, P4)", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan({ partial: true, notes: ["2 file(s) skipped due to scan budgets."] }) } })} />);
    expect(screen.getByText(/Partial scan/)).toBeTruthy();
    expect(screen.getByText(/2 file\(s\) skipped/)).toBeTruthy();
  });

  it("does not show a partial banner for a complete scan", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan({ partial: false }) } })} />);
    expect(screen.queryByText(/Partial scan/)).toBeNull();
  });

  it("collapses unmapped and retains the full list with a note when capped (R20, P5)", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan({ unmapped: 60 }) } })} />);
    expect(screen.getByText(/Unmapped dependencies \(60\)/)).toBeTruthy();
    expect(screen.getByText(/Showing 50 of 60/)).toBeTruthy();
    expect(screen.getByText(/none are discarded/)).toBeTruthy();
  });
});
