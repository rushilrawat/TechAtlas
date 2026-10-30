import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RepoXrayPanel } from "./RepoXrayPanel";
import type { DomainSummary, GraphNode, RepoScan } from "../api/types";

afterEach(cleanup);

const nodesById = new Map<string, GraphNode>([
  ["technology:react", { id: "technology:react", slug: "react", label: "React",
    node_type: "technology", node_subtype: "library", primary_domain: "domain:frontend",
    x: 0, y: 0, cluster: null, size: 5, color: "#7aa2f7" }],
]);
const domainsById = new Map<string, DomainSummary>([
  ["domain:frontend", { id: "domain:frontend", slug: "frontend", name: "Frontend Development",
    short_description: "", color: "#7aa2f7", node_count: 1 }],
]);

function scan(partial = false): RepoScan {
  return {
    scan_id: "s", status: partial ? "partial" : "completed", scanner_version: "1",
    mapping_version: "0.2.0",
    repository: { owner: "acme", name: "app", url: "https://github.com/acme/app",
      default_branch: "main", commit_sha: "abcdef1234567", description: "demo app",
      primary_language: "TypeScript", stars: 5 },
    summary: { matched_technology_count: 1, matched_concept_count: 0, unmapped_package_count: 1 },
    coverage: { files_listed: 5, files_inspected: 3, manifests_inspected: 1,
      source_files_inspected: 2, files_skipped_limit: partial ? 4 : 0,
      tree_truncated: partial, partial, notes: [] },
    detections: [{ node_id: "technology:react", node_type: "technology", role: "library",
      detection_status: "confirmed", evidence_ids: [], component_paths: ["frontend"] }],
    evidence: [], unmapped: [{ name: "mystery-lib", ecosystem: "npm",
      detection_status: "declared", evidence_ids: [] }],
  };
}

const noop = () => {};
function base(overrides = {}) {
  return {
    phase: { kind: "idle" } as const, onAnalyze: noop, onExit: noop,
    onFocusStack: noop, onFocusNode: noop, nodesById, domainsById, ...overrides,
  };
}

describe("RepoXrayPanel", () => {
  it("validates the URL and only analyzes a valid GitHub URL", () => {
    const onAnalyze = vi.fn();
    render(<RepoXrayPanel {...base({ onAnalyze })} />);
    const input = screen.getByLabelText("GitHub repository URL");
    const form = input.closest("form") as HTMLFormElement;
    fireEvent.change(input, { target: { value: "not-a-url" } });
    fireEvent.submit(form);
    expect(onAnalyze).not.toHaveBeenCalled();
    expect(screen.getByText(/valid public GitHub repository URL/i)).toBeTruthy();

    fireEvent.change(input, { target: { value: "https://github.com/acme/app" } });
    fireEvent.submit(form);
    expect(onAnalyze).toHaveBeenCalledWith("https://github.com/acme/app");
  });

  it("shows an analyzing state", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "analyzing", url: "https://github.com/acme/app" } })} />);
    expect(screen.getByText(/Scanning/)).toBeTruthy();
  });

  it("renders a completed result grouped by domain with focusable techs", () => {
    const onFocusNode = vi.fn();
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan() }, onFocusNode })} />);
    expect(screen.getByText("Frontend Development")).toBeTruthy();
    const tech = screen.getByRole("button", { name: /React/ });
    fireEvent.click(tech);
    expect(onFocusNode).toHaveBeenCalledWith("technology:react");
    // unmapped section present
    expect(screen.getByText(/Unmapped dependencies/)).toBeTruthy();
  });

  it("flags a partial scan", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "done", scan: scan(true) } })} />);
    expect(screen.getByText(/Partial scan/)).toBeTruthy();
  });

  it("renders an error state with a rate-limit retry hint", () => {
    render(<RepoXrayPanel {...base({ phase: { kind: "error", code: "rate_limited",
      message: "slow down", retryAfter: 30 } })} />);
    expect(screen.getByText(/GitHub rate limit/)).toBeTruthy();
    expect(screen.getByText(/about 30s/)).toBeTruthy();
  });
});
