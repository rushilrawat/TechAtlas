// Pure overview level-of-detail + edge-gate + node-accounting logic for the collision-free
// Explore overview (atlas-overview-collision-free bugfix). Extracted from GraphCanvas so it
// is unit-testable without a live WebGL Sigma instance — mirroring semanticZoom.ts.
//
// Design intent (user requirement #1): aggregates are a RESPONSIVE presentation layer. The
// generator precomputes deterministic membership GROUPINGS + candidate centroids per sector
// shell; the *actual* representation is decided at render time from live screen-space data
// (viewport, camera ratio, usable canvas, rendered radii, selection). An aggregate marker
// REPLACES its members visually (members hidden), never sits alongside them. Every canonical
// node stays discoverable via zoom/focus/search/details. Aggregates are presentation objects,
// never new canonical nodes or relationships.

import { bandOf } from "./semanticZoom";

/** Relationship types that are the structural domain/subdomain spokes (membership edges). */
export const STRUCTURAL_REL = new Set(["belongs_to_domain", "has_subdomain"]);

/**
 * The exact condition under which the default overview hides ALL ordinary relationship edges:
 * overview band, nothing selected/hovered, and not in Repo X-Ray. When false, edges follow the
 * normal selection/zoom rules (they reappear on interaction). Pure; drives the edge reducer.
 */
export function isOverviewEdgeHidden(args: {
  ratio: number;
  activeId: string | null;
  inScan: boolean;
}): boolean {
  const { ratio, activeId, inScan } = args;
  if (inScan) return false; // Repo X-Ray owns edge styling
  if (activeId) return false; // a selection/hover reveals genuine relationships
  return bandOf(ratio) <= 1; // overview band (0 or 1), no selection -> hide all ordinary edges
}

/**
 * Whether the overview should show individual nodes for a domain sector, or collapse its
 * members into aggregate marker(s). Responsive: decided from the live camera band and whether
 * the domain/a member is the active selection. Aggregation applies only in the overview band
 * with nothing selected; zooming past the overview band, or selecting the domain, expands it.
 */
export function sectorIsAggregatedAtOverview(args: {
  ratio: number;
  activeId: string | null;
  activeDomainId: string | null;
  domainId: string;
  inScan: boolean;
}): boolean {
  const { ratio, activeId, activeDomainId, domainId, inScan } = args;
  if (inScan) return false;
  if (bandOf(ratio) >= 2) return false; // detail zoom always shows individuals
  if (activeId && activeDomainId === domainId) return false; // selected domain expands
  return true;
}

/**
 * Node-accounting invariant: the set of individually-shown node ids plus the union of all
 * aggregated member ids must equal the full canonical node set exactly — each id appearing
 * exactly once (shown individually XOR aggregated). No canonical node is ever discarded.
 * Returns the discrepancy for assertion in tests/harness.
 */
export function accountForNodes(args: {
  allNodeIds: Iterable<string>;
  individuallyShown: Iterable<string>;
  aggregatedMembers: Iterable<string>;
}): {
  total: number;
  individual: number;
  aggregated: number;
  missing: string[];
  duplicated: string[];
} {
  const all = new Set(args.allNodeIds);
  const ind = new Set(args.individuallyShown);
  const agg = new Set(args.aggregatedMembers);
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const id of ind) {
    if (seen.has(id)) duplicated.push(id);
    seen.add(id);
  }
  for (const id of agg) {
    if (seen.has(id)) duplicated.push(id);
    seen.add(id);
  }
  const missing: string[] = [];
  for (const id of all) if (!seen.has(id)) missing.push(id);
  return {
    total: all.size,
    individual: ind.size,
    aggregated: agg.size,
    missing,
    duplicated,
  };
}

/** A screen-space axis-aligned box. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelCandidate {
  id: string;
  priority: number; // higher = kept first
  box: Box;
  /** Key of the node this label annotates (excluded from the label/node overlap test). */
  ownerKey: string;
}

/** A visible node circle box tagged with its node key (for owner exclusion). */
export interface KeyedBox extends Box {
  key: string;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Deterministic screen-space label placement: walk candidates in priority order (desc,
 * ties broken by id asc) and KEEP a label only if its box does not overlap (a) any already
 * kept label box, (b) any visible node circle box (except its own owner), (c) any excluded
 * rectangle (side panels), or (d) the viewport bounds. Lower-priority labels are dropped on
 * conflict. Returns the set of ids to SUPPRESS. Pure and unit-testable (no WebGL).
 */
export function placeLabels(args: {
  candidates: LabelCandidate[];
  nodeBoxes: KeyedBox[]; // all visible node circle boxes (screen space), keyed by node id
  panels: Box[]; // side-panel rectangles (screen space)
  viewport: { w: number; h: number };
}): Set<string> {
  const { candidates, nodeBoxes, panels, viewport } = args;
  const ordered = [...candidates].sort((a, b) =>
    a.priority !== b.priority ? b.priority - a.priority : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const kept: Box[] = [];
  const suppressed = new Set<string>();
  for (const c of ordered) {
    const b = c.box;
    // viewport clip
    if (b.x < 0 || b.y < 0 || b.x + b.w > viewport.w || b.y + b.h > viewport.h) {
      suppressed.add(c.id);
      continue;
    }
    // panel occlusion
    if (panels.some((p) => boxesOverlap(b, p))) {
      suppressed.add(c.id);
      continue;
    }
    // overlap with an already-kept label
    if (kept.some((k) => boxesOverlap(b, k))) {
      suppressed.add(c.id);
      continue;
    }
    // overlap with a visible node circle (not its own owner)
    if (nodeBoxes.some((n) => n.key !== c.ownerKey && boxesOverlap(b, n))) {
      suppressed.add(c.id);
      continue;
    }
    kept.push(b);
  }
  return suppressed;
}
