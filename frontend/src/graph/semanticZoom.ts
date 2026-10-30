// Pure semantic-zoom logic (spec §5.5), extracted so it can be unit-tested without
// a live WebGL Sigma instance. GraphCanvas imports these.

import type { NodeType } from "../api/types";

// Camera ratio thresholds: smaller ratio = more zoomed in.
export const RATIO_UNIVERSE = 1.1; // zoomed out: only domains + biggest hubs labelled
export const RATIO_DOMAIN = 0.55; // mid: domains, concepts, prominent technologies

export type ZoomBand = 0 | 1 | 2; // 0 = universe, 1 = domain, 2 = detail

export function bandOf(ratio: number): ZoomBand {
  if (ratio > RATIO_UNIVERSE) return 0;
  if (ratio > RATIO_DOMAIN) return 1;
  return 2;
}

/** Whether a node's label should be shown at the given camera ratio. */
export function labelVisibleAtRatio(
  nodeType: NodeType,
  size: number,
  ratio: number,
): boolean {
  const band = bandOf(ratio);
  if (band === 0) return nodeType === "domain" || size >= 12;
  if (band === 1) return nodeType !== "technology" || size >= 8;
  return true;
}
