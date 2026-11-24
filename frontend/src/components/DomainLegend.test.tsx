import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DomainLegend } from "./DomainLegend";
import { emptyFilter } from "../graph/filters";
import type { DomainSummary } from "../api/types";

afterEach(cleanup);

const domains: DomainSummary[] = [
  { id: "domain:backend", slug: "backend", name: "Backend Development", short_description: "", color: "#0f0", node_count: 1172 },
  { id: "domain:cms", slug: "cms", name: "CMS & E-commerce", short_description: "", color: "#0f0", node_count: 33, parent_id: "domain:backend" } as DomainSummary,
];

describe("DomainLegend (Fields panel)", () => {
  it("lists fields with sub-fields, focuses on click and filters with the checkbox", () => {
    const onPick = vi.fn(), onFilterChange = vi.fn();
    render(<DomainLegend domains={domains} onPick={onPick} collapsed={false} onToggle={() => {}}
      filter={emptyFilter()} onFilterChange={onFilterChange} />);
    expect(screen.getByText("1 field · 1 sub-field")).toBeTruthy();
    expect(screen.getByText("1,172")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /CMS & E-commerce/ }));
    expect(onPick).toHaveBeenCalledWith("cms");
    fireEvent.click(screen.getByRole("checkbox", { name: /Backend Development/ }));
    expect(onFilterChange.mock.calls[0][0].domains.has("domain:backend")).toBe(true);
  });
});
