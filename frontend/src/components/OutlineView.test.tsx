import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DomainSummary, GraphNode } from "../api/types";
import { OutlineView } from "./OutlineView";

const node = (id: string, label: string, domain: string, type: GraphNode["node_type"] = "technology"): GraphNode => ({
  id, slug: id.split(":")[1], label, node_type: type, node_subtype: null, primary_domain: domain,
  x: 0, y: 0, cluster: domain, size: 1, color: "#fff",
});
const domains: DomainSummary[] = [
  { id: "domain:frontend", slug: "frontend", name: "Frontend Development", short_description: "", color: "#0af", node_count: 2 },
  { id: "domain:databases", slug: "databases", name: "Databases", short_description: "", color: "#fa0", node_count: 1 },
];
const nodes = [
  node("technology:react", "React", "domain:frontend"),
  node("technology:vue", "Vue", "domain:frontend"),
  node("technology:postgresql", "PostgreSQL", "domain:databases"),
];

describe("OutlineView", () => {
  it("lists every node under its domain and filters by name", () => {
    render(<OutlineView nodes={nodes} domains={domains} onPick={() => {}} />);
    expect(screen.getByText("3 nodes")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter the outline by name"), { target: { value: "post" } });
    expect(screen.getByText("1 node")).toBeTruthy();
    expect(screen.queryByText("Frontend Development")).toBeNull();
  });

  it("opens a node when picked", () => {
    const onPick = vi.fn();
    render(<OutlineView nodes={nodes} domains={domains} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /React/ }));
    expect(onPick).toHaveBeenCalledWith("technology:react");
  });
});

describe("OutlineView closing", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<OutlineView nodes={nodes} domains={domains} onPick={() => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
