import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import type { NodeDetail } from "../api/types";

// Mock the API client so the panel's on-demand fetch is deterministic and offline.
const nodeMock = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    node: (slug: string) => nodeMock(slug),
  },
}));

const base: NodeDetail = {
  id: "technology:python",
  slug: "python",
  name: "Python",
  node_type: "technology",
  node_subtype: "programming_language",
  primary_domain: "domain:software-engineering",
  short_description: "A readable, general-purpose language.",
  long_description: null,
  official_url: "https://www.python.org",
  documentation_url: null,
  wikipedia_title: "Python (programming language)",
  wikidata_id: "Q28865",
  lifecycle_status: "active",
  aliases: [],
  color: "#8b9dc3",
  neighbors: [],
  summary: null,
};

afterEach(() => {
  cleanup();
  nodeMock.mockReset();
});

describe("NodeDetailsPanel summary (Phase 1C)", () => {
  it("renders the Wikipedia summary with attribution when present", async () => {
    nodeMock.mockResolvedValue({
      ...base,
      summary: {
        extract: "Python is a high-level programming language.",
        source_url: "https://en.wikipedia.org/wiki/Python_(programming_language)",
        lang: "en",
        fetched_at: "2026-10-29T00:00:00Z",
        license: "CC BY-SA 4.0",
      },
    });

    render(<NodeDetailsPanel slugOrId="python" onClose={() => {}} onNavigate={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/high-level programming language/)).toBeTruthy(),
    );
    // attribution lives inside the summary section: a link to the source + license.
    const summary = screen.getByLabelText("Wikipedia summary");
    const link = summary.querySelector("a");
    expect(link?.getAttribute("href")).toContain("en.wikipedia.org/wiki/Python");
    expect(screen.getByText(/CC BY-SA 4\.0/)).toBeTruthy();
  });

  it("falls back to the outbound Wikipedia link when no summary is available", async () => {
    nodeMock.mockResolvedValue({ ...base, summary: null });

    render(<NodeDetailsPanel slugOrId="python" onClose={() => {}} onNavigate={() => {}} />);

    await waitFor(() => expect(screen.getByText("Python")).toBeTruthy());
    // no summary section
    expect(screen.queryByLabelText("Wikipedia summary")).toBeNull();
    // but the outbound Wikipedia action link is still present
    const link = screen.getByRole("link", { name: /wikipedia/i });
    expect(link.getAttribute("href")).toContain("/wiki/Python");
  });

  it("renders the extract as text, not HTML (no injection)", async () => {
    nodeMock.mockResolvedValue({
      ...base,
      summary: {
        extract: "<img src=x onerror=alert(1)> dangerous",
        source_url: "https://en.wikipedia.org/wiki/Python_(programming_language)",
        lang: "en",
        fetched_at: "2026-10-29T00:00:00Z",
        license: "CC BY-SA 4.0",
      },
    });

    const { container } = render(
      <NodeDetailsPanel slugOrId="python" onClose={() => {}} onNavigate={() => {}} />,
    );

    await waitFor(() => expect(screen.getByText(/dangerous/)).toBeTruthy());
    // the literal markup is shown as text; no <img> element was created
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> dangerous/)).toBeTruthy();
  });
});
