import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NodeDetailsPanel } from "./NodeDetailsPanel";

// Minimal api mock so the panel can mount without network.
vi.mock("../api/client", () => ({
  api: {
    node: vi.fn().mockResolvedValue({
      id: "technology:flask", slug: "flask", name: "Flask", node_type: "technology",
      node_subtype: "framework", primary_domain: "domain:backend",
      short_description: "A web framework", long_description: null,
      official_url: null, documentation_url: null, wikipedia_url: null,
      wikipedia_title: null, popularity: null, size_basis: null, aliases: [], neighbors: [],
    }),
  },
}));

afterEach(cleanup);

describe("UI-D focus management (req 1 & 2)", () => {
  it("moves focus into the detail panel on open", async () => {
    render(<NodeDetailsPanel slugOrId="flask" onClose={() => {}} onNavigate={() => {}} />);
    const panel = screen.getByRole("region", { name: "Node details" });
    await waitFor(() => expect(document.activeElement).toBe(panel));
  });

  it("restores focus to the opener element on unmount (close)", async () => {
    // Create an opener button, focus it, then open the panel from that focus.
    const opener = document.createElement("button");
    opener.textContent = "Flask row";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const onClose = vi.fn();
    const { unmount } = render(
      <NodeDetailsPanel slugOrId="flask" onClose={onClose} onNavigate={() => {}} />,
    );
    const panel = screen.getByRole("region", { name: "Node details" });
    await waitFor(() => expect(document.activeElement).toBe(panel));

    // Unmount (simulates close via any path) -> focus returns to the opener.
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("Escape triggers onClose", async () => {
    const onClose = vi.fn();
    render(<NodeDetailsPanel slugOrId="flask" onClose={onClose} onNavigate={() => {}} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("close button triggers onClose", async () => {
    const onClose = vi.fn();
    render(<NodeDetailsPanel slugOrId="flask" onClose={onClose} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(onClose).toHaveBeenCalled();
  });
});
