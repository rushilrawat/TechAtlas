import type { DetectionStatus } from "../../api/types";

// Explore state: the selected node's neighborhood is prominent; everything else recedes.
export const DIM_NODE = "rgba(120,130,150,0.12)";
// Edges stay subordinate to nodes: thin, low-alpha strokes in the owning domain's color.
// Cross-domain bridges are a quiet neutral, the faintest overview layer.
export const CROSS_EDGE = "rgba(222,208,178,0.42)";
export const ACTIVE_CROSS_EDGE = "rgba(240,214,160,0.85)";
export const RING_ALPHA = [1, 0.95, 0.86, 0.74];

/**
 * Node fade: Sigma's node program draws fills opaque, so a receding node is mixed toward
 * the page background instead of given an alpha. `amount` 1 = full color, 0 = background.
 */
export function fadeNode(color: unknown, amount: number): string {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return String(color);
  const bg = document.documentElement.dataset.theme === "light" ? [230, 237, 243] : [11, 14, 20];
  const c = [1, 3, 5].map((i, k) => Math.round(bg[k] + (parseInt(color.slice(i, i + 2), 16) - bg[k]) * amount));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** `#rrggbb` -> rgba() with the given alpha; non-hex colors pass through unchanged. */
export function withAlpha(color: unknown, alpha: number): string {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return String(color);
  return `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${alpha})`;
}

// Repo X-Ray detection-status ring colors (spec §5: a SEPARATE visual channel from the
// node's domain color). confirmed=green, declared=blue, inferred=amber, related=neutral.
export const STATUS_RING: Record<DetectionStatus, string> = {
  confirmed: "#4ade80",
  declared: "#60a5fa",
  inferred: "#fbbf24",
  related: "#c0caf5",
};
// Repo X-Ray state: detected nodes at full opacity; unrelated nodes fade to 0.10-0.20;
// verified edges (both endpoints detected) prominent; contextual (one endpoint) faint;
// unrelated edges nearly invisible so the detected stack reads in seconds (UI-A R3).
export const SCAN_DIM_NODE = "rgba(110,120,140,0.11)";        // 0.10-0.20 unrelated node (low end)
export const SCAN_HILITE_EDGE = "rgba(190,205,255,0.7)";      // 0.60-0.80 verified-between
export const SCAN_CONTEXT_EDGE = "rgba(150,165,205,0.20)";    // 0.15-0.30 contextual
// Unrelated edges are the overwhelming majority (hundreds); even a tiny alpha accumulates
// into a visible web where they overlap, so they are effectively hidden (UI-A R3.3).
export const SCAN_DIM_EDGE = "rgba(120,130,150,0.0)";
