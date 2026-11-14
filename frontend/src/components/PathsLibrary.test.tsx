import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PathsLibrary } from "./PathsLibrary";
import type { PathEntry } from "../graph/pathsLibrary";

afterEach(cleanup);

const entry = (index: number, title: string, fieldId: string, stepCount: number): PathEntry => ({
  index, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), stepCount, fieldId,
  fieldName: fieldId === "domain:web" ? "Web" : "Cloud", color: "#fff",
  labels: Array.from({ length: stepCount }, (_, i) => `${title} step ${i + 1}`),
  haystack: title.toLowerCase(),
});
const entries = [
  entry(0, "How a web request works", "domain:web", 5),
  entry(1, "Containers, step by step", "domain:cloud", 4),
  entry(2, "Ship a modern web app", "domain:web", 6),
];

function setup(overrides = {}) {
  const props = { entries, done: new Set<string>(), progress: {}, activeIndex: null, onStart: vi.fn(), onClose: vi.fn(), ...overrides };
  render(<PathsLibrary {...props} />);
  return props;
}

describe("PathsLibrary", () => {
  it("shows featured paths and every path, and starts one on click", () => {
    const { onStart } = setup();
    const dialog = screen.getByRole("dialog", { name: "Guided paths" });
    expect(within(dialog).getByText("Start here")).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Containers, step by step/ })[0]);
    expect(onStart).toHaveBeenCalledWith(1);
  });

  it("filters by search and hides the featured row while filtering", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Search guided paths"), { target: { value: "containers" } });
    expect(screen.queryByText("Start here")).toBeNull();
    expect(screen.getByText("1 matching path")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("All paths")).toBeTruthy();
  });

  it("filters by progress and shows status badges", () => {
    setup({ done: new Set(["Ship a modern web app"]), progress: { "containers-step-by-step": 2 } });
    expect(screen.getAllByText("✓ Done").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Step 3 of 4").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getByText("1 matching path")).toBeTruthy();
    expect(screen.getByText("You’ve finished", { exact: false })).toBeTruthy();
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
