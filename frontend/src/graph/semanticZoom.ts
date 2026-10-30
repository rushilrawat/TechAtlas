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
  // UI-E: stricter label gating to cut Universe-view collisions. At the overview band
  // only domains and the very largest hubs are labelled; at the mid band, domains plus
  // prominent concepts/technologies; full detail only when zoomed in.
  if (band === 0) return nodeType === "domain" || size >= 18;
  if (band === 1) return nodeType === "domain" || size >= 12;
  return true;
}


// --- Label priority + persistent-label selection (Phase 1.5 UI-A) ----------------
//
// In Repo X-Ray the detected stack must be readable at a glance, so detected nodes get
// persistent labels regardless of zoom band, bounded by LABEL_BUDGET to avoid clutter
// and per the performance constraint (no DOM-label flood). Selection is deterministic.

import type { DetectionStatus } from "../api/types";

// Max simultaneously-shown persistent detected-node labels. Bounded for readability
// and performance (no DOM-label flood), but set high enough that typical stacks and
// the 25-30 stress range are fully labelled; very large monorepo scans still cap here.
// Selected/hovered labels are shown IN ADDITION via the reducer (they never count
// against this budget), so the active node is always labelled.
export const LABEL_BUDGET = 30;

// Higher number = higher priority (shown first when space/budget is tight).
export type LabelContext = {
  selectedId: string | null;
  hoveredId: string | null;
  // detection status for detected nodes (absent for non-detected).
  statusByNode?: Map<string, DetectionStatus> | null;
  // popularity-ish ranking input (node render size is a stable proxy already in-graph).
  sizeById?: Map<string, number> | null;
};

const _STATUS_RANK: Record<DetectionStatus, number> = {
  confirmed: 3,
  declared: 2,
  inferred: 1,
  related: 0,
};

/**
 * Priority order (design LLD): selected > hovered > confirmed > declared > inferred >
 * related > (non-detected). Ties within a detected status are broken later by
 * popularity then node-id, so this returns a coarse rank; selectPersistentLabels applies
 * the full deterministic ordering.
 */
export function labelPriority(id: string, ctx: LabelContext): number {
  if (ctx.selectedId && id === ctx.selectedId) return 1000;
  if (ctx.hoveredId && id === ctx.hoveredId) return 900;
  const status = ctx.statusByNode?.get(id);
  if (status) return 100 + _STATUS_RANK[status] * 10;
  return 0;
}

/**
 * Deterministically choose which detected nodes get a persistent label, bounded by
 * `budget`. Order: priority desc, then popularity (size) desc, then node-id ascending
 * (stable, reproducible). Returns a Set for O(1) membership in the reducer.
 */
export function selectPersistentLabels(
  detectedIds: Iterable<string>,
  ctx: LabelContext,
  budget: number = LABEL_BUDGET,
): Set<string> {
  const ids = [...detectedIds];
  const sizeOf = (id: string) => ctx.sizeById?.get(id) ?? 0;
  ids.sort((a, b) => {
    const pa = labelPriority(a, ctx);
    const pb = labelPriority(b, ctx);
    if (pa !== pb) return pb - pa;              // priority desc
    const sa = sizeOf(a);
    const sb = sizeOf(b);
    if (sa !== sb) return sb - sa;              // popularity (size) desc
    return a < b ? -1 : a > b ? 1 : 0;          // node-id asc (deterministic tiebreak)
  });
  return new Set(ids.slice(0, Math.max(0, budget)));
}
